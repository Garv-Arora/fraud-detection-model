import os
import json
import logging
from datetime import datetime
from typing import List, Optional
import pandas as pd
from fastapi import FastAPI, Depends, HTTPException, UploadFile, File, BackgroundTasks, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import StreamingResponse, HTMLResponse, FileResponse
from sqlalchemy.orm import Session

from backend.database import engine, Base, get_db
from backend.models import Case, Evidence, ImageMatch, AuditLog
import backend.schemas as schemas
import backend.extractor as extractor
import backend.search_engine as search_engine
import backend.scorer as scorer
import backend.exporter as exporter

# Configure logging
logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(name)s - %(levelname)s - %(message)s")
logger = logging.getLogger("UniversalSompoAPI")

# Initialize database tables
Base.metadata.create_all(bind=engine)

app = FastAPI(
    title="Universal Sompo AI Claim Evidence Finder API",
    description="Backend API for Ingestion, Search, scoring, and exporting evidence for Quest claims",
    version="1.0.0"
)

# Configure CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Directory paths
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
UPLOAD_DIR = os.path.join(BASE_DIR, "static", "uploads")
TEMPLATE_DIR = os.path.join(BASE_DIR, "templates")

os.makedirs(UPLOAD_DIR, exist_ok=True)
os.makedirs(TEMPLATE_DIR, exist_ok=True)

# Mount uploads static directory
app.mount("/static/uploads", StaticFiles(directory=UPLOAD_DIR), name="uploads")

def run_evidence_search_pipeline(case_id: int, db_session: Session):
    try:
        case = db_session.query(Case).filter(Case.id == case_id).first()
        if not case:
            logger.error(f"Case {case_id} not found in background task.")
            return
            
        logger.info(f"Starting V1.0 evidence search pipeline for Quest claim {case.claim_id}")
        
        # Add Audit Log
        db_session.add(AuditLog(
            case_id=case.id,
            action="Search Initiated",
            details="Search fanned out in parallel to news portals, Google Lens checker, and Facebook/Instagram."
        ))
        db_session.commit()
        
        # Parse facts
        facts = {
            "claim_id": case.claim_id,
            "policy_information": case.policy_information,
            "supporting_information": case.supporting_information,
            "accident_date_time": case.accident_date_time,
            "loss_location": case.loss_location,
            "vehicle_numbers": [v.strip() for v in case.vehicle_numbers.split(",") if v.strip()] if case.vehicle_numbers else [],
            "vehicle_types": [v.strip() for v in case.vehicle_types.split(",") if v.strip()] if case.vehicle_types else [],
            "parties_involved": [v.strip() for v in case.parties_involved.split(",") if v.strip()] if case.parties_involved else [],
            "injury_or_death": case.injury_or_death,
            "police_station": case.police_station,
            "district_state": case.district_state,
            "FIR_cause_narrative": case.FIR_cause_narrative
        }
        
        # Generate Queries
        queries = search_engine.generate_search_queries(facts)
        
        db_session.add(AuditLog(
            case_id=case.id,
            action="Queries Expanded",
            details=f"Fanned out into queries: " + ", ".join([f"'{q}'" for q in queries])
        ))
        db_session.commit()
        
        # Execute Search
        raw_results = search_engine.search_public_sources(facts, queries)
        
        # Score Results
        scored_evidences = []
        for ev in raw_results:
            score = scorer.score_evidence_link(facts, ev)
            ev["score"] = score
            scored_evidences.append(ev)
            
        # Deduplicate & rank top 10
        ranked_evidences = sorted(scored_evidences, key=lambda x: x["score"], reverse=True)[:10]
        
        # Delete old evidence logs
        db_session.query(Evidence).filter(Evidence.case_id == case.id).delete()
        
        # Save evidence
        for ev in ranked_evidences:
            evidence_obj = Evidence(
                case_id=case.id,
                source=ev.get("source", "Web"),
                title=ev.get("title"),
                url=ev.get("url"),
                snippet=ev.get("snippet"),
                score=ev.get("score", 0.0),
                why_relevant=ev.get("why_relevant") or f"Matched on query: {ev.get('query_used')}",
                publish_date=ev.get("publish_date"),
                query_used=ev.get("query_used")
            )
            db_session.add(evidence_obj)
            
        # Mismatch evaluation
        flagged_categories, mismatch_explanations = scorer.evaluate_mismatch_flags(facts, ranked_evidences)
        
        # Lens image check
        images = db_session.query(ImageMatch).filter(ImageMatch.case_id == case.id).all()
        has_reused_image = False
        image_matches_list = []
        for img in images:
            match_res = search_engine.check_image_match(img.image_name, facts)
            img.status = match_res["status"]
            img.matched_url = match_res["matched_url"]
            img.why_matched = match_res["why_matched"]
            image_matches_list.append({
                "image_name": img.image_name,
                "status": img.status,
                "matched_url": img.matched_url,
                "why_matched": img.why_matched
            })
            if "Reused" in img.status:
                has_reused_image = True
                
        # Generate AI Evidence Summary (Adaapt AI Summary module)
        ai_summary = scorer.generate_ai_summary(facts, ranked_evidences, flagged_categories, image_matches_list)
        
        # Score Average
        top_scores = [ev["score"] for ev in ranked_evidences[:3]]
        avg_top_score = sum(top_scores) / len(top_scores) if top_scores else 0.0
        
        if flagged_categories or has_reused_image or avg_top_score < 0.5:
            risk_level = "HIGH REVIEW"
        elif avg_top_score < 0.75:
            risk_level = "MEDIUM REVIEW"
        else:
            risk_level = "LOW RISK"
            
        # Update case
        case.overall_score = round(avg_top_score, 2)
        case.risk_level = risk_level
        case.status = "Completed"
        case.ai_summary = ai_summary
        case.top_mismatches = ",".join(flagged_categories)
        case.mismatch_cause = mismatch_explanations["cause"]
        case.mismatch_location = mismatch_explanations["location"]
        case.mismatch_time = mismatch_explanations["time"]
        case.mismatch_vehicle = mismatch_explanations["vehicle"]
        case.mismatch_entity = mismatch_explanations["entity"]
        
        db_session.add(AuditLog(
            case_id=case.id,
            action="Analysis Completed",
            details=f"Analysis finished. Summary generated. Risk: {risk_level}."
        ))
        
        db_session.commit()
        logger.info(f"Pipeline completed successfully for claim {case.claim_id}")
        
    except Exception as e:
        logger.error(f"Error running pipeline: {e}", exc_info=True)
        try:
            case = db_session.query(Case).filter(Case.id == case_id).first()
            if case:
                case.status = "Error"
                db_session.add(AuditLog(
                    case_id=case.id,
                    action="Pipeline Error",
                    details=f"Error occurred: {str(e)}"
                ))
                db_session.commit()
        except Exception as db_ex:
            logger.error(f"Failed to save error status: {db_ex}")

# API ROUTES

@app.get("/api/templates/excel")
def download_excel_template():
    """Serves the predefined Excel upload template for claims ingestion."""
    template_path = os.path.join(TEMPLATE_DIR, "claims_upload_template.xlsx")
    if not os.path.exists(template_path):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Predefined template file not found."
        )
    return FileResponse(
        template_path,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        filename="Universal_Sompo_Claims_Upload_Template.xlsx"
    )

@app.post("/api/cases/pull-from-quest")
def pull_claims_from_quest(db: Session = Depends(get_db)):
    """
    Simulates calling the Quest Portal API to retrieve active claims and FIRs automatically.
    This is the primary default method for case ingestion.
    """
    quest_claims = [
        {
            "claim_id": "TP-RCU-UP-00517/2025",
            "policy_information": "POL-998877-2025",
            "supporting_information": "Previous claim registered for vehicle UP-85-AT-9988 in 2023 for front bumper damage.",
            "accident_date_time": "2025-05-12T14:30:00",
            "loss_location": "near Kosi Kalan, NH-2",
            "vehicle_numbers": "UP-85-AT-9988,HR-26-Z-1122",
            "vehicle_types": "Motorcycle,Truck",
            "parties_involved": "Ramesh Kumar (Rider),Suresh Singh (Truck Driver)",
            "injury_or_death": "Ramesh Kumar suffered head injuries, declared dead on arrival at District Hospital",
            "FIR_cause_narrative": "The motorcycle UP-85-AT-9988 ridden by Ramesh Kumar was hit from behind by a speeding truck bearing registration number HR-26-Z-1122 on NH-2 near Kosi Kalan. The rider Ramesh Kumar fell onto the road and sustained fatal head injuries. The truck driver Suresh Singh fled the spot leaving the vehicle.",
            "police_station": "Kosi Kalan PS",
            "district_state": "Mathura, Uttar Pradesh"
        },
        {
            "claim_id": "TP-RCU-MH-00921/2025",
            "policy_information": "POL-112233-2025",
            "supporting_information": "First claim on this policy. Zero prior claim history.",
            "accident_date_time": "2025-06-18T08:15:00",
            "loss_location": "Expressway, near Lonavala",
            "vehicle_numbers": "MH-12-AB-5678",
            "vehicle_types": "Car",
            "parties_involved": "Vijay Salvi (Driver / Owner)",
            "injury_or_death": "No injuries reported. Vehicle bumper and headlight damaged.",
            "FIR_cause_narrative": "The car MH-12-AB-5678 was traveling towards Mumbai when a dog suddenly crossed the highway. The driver swerved and hit the divider, causing front-end damage. Police report confirmed dog carcass on road and matching skid marks.",
            "police_station": "Lonavala Highway PS",
            "district_state": "Pune, Maharashtra"
        },
        {
            "claim_id": "TP-RCU-DL-00104/2025",
            "policy_information": "POL-445566-2025",
            "supporting_information": "Policy renewed 3 days prior to the reported accident date.",
            "accident_date_time": "2025-04-05T23:10:00",
            "loss_location": "Outer Ring Road, near Rohini Sec-3",
            "vehicle_numbers": "DL-3C-XY-1234,HR-55-A-0012",
            "vehicle_types": "Car,Tractor",
            "parties_involved": "Ankit Gupta (Driver),Jagpreet Singh (Tractor Driver)",
            "injury_or_death": "Ankit Gupta suffered minor leg fracture, admitted to Max Hospital.",
            "FIR_cause_narrative": "A car DL-3C-XY-1234 driven by Ankit Gupta collided with an agricultural tractor HR-55-A-0012 carrying building materials on the Outer Ring Road. Car front smashed. Tractor driver fled the spot.",
            "police_station": "Rohini Sector-3 PS",
            "district_state": "North West Delhi, Delhi"
        }
    ]
    
    imported_claims = []
    for c in quest_claims:
        existing = db.query(Case).filter(Case.claim_id == c["claim_id"]).first()
        if not existing:
            confidence = {
                "claim_id": 1.0,
                "policy_information": 0.98,
                "supporting_information": 0.95,
                "accident_date_time": 0.96,
                "loss_location": 0.95,
                "vehicle_numbers": 0.97,
                "vehicle_types": 0.96,
                "parties_involved": 0.94,
                "injury_or_death": 0.95,
                "FIR_cause_narrative": 0.98,
                "police_station": 0.96,
                "district_state": 0.97
            }
            
            db_case = Case(
                claim_id=c["claim_id"],
                policy_information=c["policy_information"],
                supporting_information=c["supporting_information"],
                accident_date_time=c["accident_date_time"],
                loss_location=c["loss_location"],
                vehicle_numbers=c["vehicle_numbers"],
                vehicle_types=c["vehicle_types"],
                parties_involved=c["parties_involved"],
                injury_or_death=c["injury_or_death"],
                FIR_cause_narrative=c["FIR_cause_narrative"],
                police_station=c["police_station"],
                district_state=c["district_state"],
                confidence_scores=json.dumps(confidence),
                confirmed=False,
                status="Pending Review",
                risk_level="Pending Review"
            )
            db.add(db_case)
            db.commit()
            db.refresh(db_case)
            
            db.add(AuditLog(
                case_id=db_case.id,
                action="Quest API Ingestion",
                details=f"Retrieved claim {c['claim_id']} automatically from Quest API."
            ))
            db.commit()
            imported_claims.append(c["claim_id"])
            
    return {
        "success": True,
        "message": f"Successfully pulled cases from Quest Portal API. Ingested {len(imported_claims)} new claims.",
        "claims": imported_claims
    }

@app.post("/api/cases/upload-excel")
async def upload_excel_claims(
    file: UploadFile = File(...),
    db: Session = Depends(get_db)
):
    """
    Parses the uploaded predefined Excel template, processes single or multiple claim records,
    and stores them in the case store database.
    """
    filename = file.filename
    if not (filename.endswith(".xlsx") or filename.endswith(".xls")):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid file format. Please upload an Excel file (.xlsx)."
        )
        
    temp_path = os.path.join(UPLOAD_DIR, f"upload_{filename}")
    try:
        # Save Excel temporarily
        with open(temp_path, "wb") as f:
            f.write(await file.read())
            
        # Parse Excel using pandas
        df = pd.read_excel(temp_path)
        
        required_headers = [
            "Claim Number", "Policy Information", "Accident Date", "Accident Time", 
            "Accident Location", "District State", "Police Station", "Vehicle Registration Numbers",
            "Vehicle Types", "Involved Parties", "Injury or Death", "Claim Narrative", "Supporting Information"
        ]
        
        # Verify headers loosely
        for rh in required_headers:
            if rh not in df.columns:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"Template mismatch. Column '{rh}' is missing from the Excel file."
                )
                
        imported_claims = []
        for idx, row in df.iterrows():
            claim_no = str(row.get("Claim Number", "")).strip()
            if not claim_no or claim_no == "nan":
                continue  # Skip rows without claim number
                
            # Check if claim_id already exists
            existing = db.query(Case).filter(Case.claim_id == claim_no).first()
            if existing:
                continue  # Skip duplicates
                
            # Compile accident date & time
            acc_date = str(row.get("Accident Date", "")).strip()
            acc_time = str(row.get("Accident Time", "")).strip()
            date_time_str = None
            if acc_date and acc_date != "nan":
                date_time_str = acc_date.split(" ")[0] # extract date if datetime object
                if acc_time and acc_time != "nan":
                    date_time_str += "T" + acc_time
                    
            confidence = {
                "claim_id": 1.0,
                "policy_information": 1.0,
                "supporting_information": 0.9,
                "accident_date_time": 0.9,
                "loss_location": 0.9,
                "vehicle_numbers": 0.9,
                "vehicle_types": 0.9,
                "parties_involved": 0.9,
                "injury_or_death": 0.9,
                "FIR_cause_narrative": 0.9,
                "police_station": 0.9,
                "district_state": 0.9
            }
            
            db_case = Case(
                claim_id=claim_no,
                policy_information=None if str(row.get("Policy Information")) == "nan" else str(row.get("Policy Information")).strip(),
                supporting_information=None if str(row.get("Supporting Information")) == "nan" else str(row.get("Supporting Information")).strip(),
                accident_date_time=date_time_str,
                loss_location=None if str(row.get("Accident Location")) == "nan" else str(row.get("Accident Location")).strip(),
                vehicle_numbers=None if str(row.get("Vehicle Registration Numbers")) == "nan" else str(row.get("Vehicle Registration Numbers")).strip(),
                vehicle_types=None if str(row.get("Vehicle Types")) == "nan" else str(row.get("Vehicle Types")).strip(),
                parties_involved=None if str(row.get("Involved Parties")) == "nan" else str(row.get("Involved Parties")).strip(),
                injury_or_death=None if str(row.get("Injury or Death")) == "nan" else str(row.get("Injury or Death")).strip(),
                FIR_cause_narrative=None if str(row.get("Claim Narrative")) == "nan" else str(row.get("Claim Narrative")).strip(),
                police_station=None if str(row.get("Police Station")) == "nan" else str(row.get("Police Station")).strip(),
                district_state=None if str(row.get("District State")) == "nan" else str(row.get("District State")).strip(),
                confidence_scores=json.dumps(confidence),
                confirmed=False,
                status="Pending Review",
                risk_level="Pending Review"
            )
            db.add(db_case)
            db.commit()
            db.refresh(db_case)
            
            db.add(AuditLog(
                case_id=db_case.id,
                action="Excel Ingestion",
                details=f"Claim records imported successfully from file: '{filename}'."
            ))
            db.commit()
            imported_claims.append(claim_no)
            
        return {
            "success": True,
            "message": f"Successfully processed Excel upload. Ingested {len(imported_claims)} claims.",
            "claims": imported_claims
        }
    except HTTPException as he:
        raise he
    except Exception as e:
        logger.error(f"Error parsing Excel: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to read claim template contents: {str(e)}"
        )
    finally:
        if os.path.exists(temp_path):
            os.remove(temp_path)

@app.post("/api/cases/ingest-text", response_model=schemas.IngestionFactsResponse)
def ingest_claim_text(req: schemas.CaseIngestTextRequest, db: Session = Depends(get_db)):
    existing = db.query(Case).filter(Case.claim_id == req.claim_id).first()
    if existing:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Claim ID {req.claim_id} already exists."
        )
        
    facts, confidence = extractor.extract_facts_from_text(req.fir_text, req.claim_id)
    
    db_case = Case(
        claim_id=req.claim_id,
        policy_information=facts.get("policy_information"),
        supporting_information=facts.get("supporting_information"),
        accident_date_time=facts.get("accident_date_time"),
        loss_location=facts.get("loss_location"),
        vehicle_numbers=",".join(facts.get("vehicle_numbers", [])),
        vehicle_types=",".join(facts.get("vehicle_types", [])),
        parties_involved=",".join(facts.get("parties_involved", [])),
        injury_or_death=facts.get("injury_or_death"),
        FIR_cause_narrative=facts.get("FIR_cause_narrative"),
        police_station=facts.get("police_station"),
        district_state=facts.get("district_state"),
        confidence_scores=json.dumps(confidence),
        confirmed=False,
        status="Pending Review",
        risk_level="Pending Review"
    )
    db.add(db_case)
    db.commit()
    db.refresh(db_case)
    
    db.add(AuditLog(
        case_id=db_case.id,
        action="Case Ingested",
        details="Claim facts extracted from Quest raw narrative. Awaiting investigator review."
    ))
    db.commit()
    
    return {
        "facts": facts,
        "confidence_scores": confidence
    }

@app.post("/api/cases/ingest-file", response_model=schemas.IngestionFactsResponse)
async def ingest_claim_file(
    claim_id: str,
    file: UploadFile = File(...),
    db: Session = Depends(get_db)
):
    existing = db.query(Case).filter(Case.claim_id == claim_id).first()
    if existing:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Claim ID {claim_id} already exists."
        )
        
    content = ""
    filename = file.filename
    temp_path = os.path.join(UPLOAD_DIR, f"temp_{filename}")
    
    try:
        with open(temp_path, "wb") as f:
            f.write(await file.read())
            
        if filename.endswith(".pdf"):
            content = extractor.extract_text_from_pdf(temp_path)
        else:
            with open(temp_path, "r", encoding="utf-8", errors="ignore") as f:
                content = f.read()
    except Exception as e:
        logger.error(f"Error uploading file: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to process file: {str(e)}"
        )
    finally:
        if os.path.exists(temp_path):
            os.remove(temp_path)
            
    if not content.strip():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No readable text extracted from the document."
        )
        
    facts, confidence = extractor.extract_facts_from_text(content, claim_id)
    
    db_case = Case(
        claim_id=claim_id,
        policy_information=facts.get("policy_information"),
        supporting_information=facts.get("supporting_information"),
        accident_date_time=facts.get("accident_date_time"),
        loss_location=facts.get("loss_location"),
        vehicle_numbers=",".join(facts.get("vehicle_numbers", [])),
        vehicle_types=",".join(facts.get("vehicle_types", [])),
        parties_involved=",".join(facts.get("parties_involved", [])),
        injury_or_death=facts.get("injury_or_death"),
        FIR_cause_narrative=facts.get("FIR_cause_narrative"),
        police_station=facts.get("police_station"),
        district_state=facts.get("district_state"),
        confidence_scores=json.dumps(confidence),
        confirmed=False,
        status="Pending Review",
        risk_level="Pending Review"
    )
    db.add(db_case)
    db.commit()
    db.refresh(db_case)
    
    db.add(AuditLog(
        case_id=db_case.id,
        action="Case Ingested",
        details=f"Claim facts extracted from uploaded file: '{filename}'."
    ))
    db.commit()
    
    return {
        "facts": facts,
        "confidence_scores": confidence
    }

@app.put("/api/cases/{claim_id}/confirm-facts", response_model=schemas.CaseResponse)
def confirm_facts(
    claim_id: str,
    req: schemas.UpdateFactsRequest,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db)
):
    case = db.query(Case).filter(Case.claim_id == claim_id).first()
    if not case:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Case with claim ID {claim_id} not found."
        )
        
    case.policy_information = req.facts.policy_information
    case.supporting_information = req.facts.supporting_information
    case.accident_date_time = req.facts.accident_date_time
    case.loss_location = req.facts.loss_location
    case.vehicle_numbers = ",".join(req.facts.vehicle_numbers)
    case.vehicle_types = ",".join(req.facts.vehicle_types)
    case.parties_involved = ",".join(req.facts.parties_involved)
    case.injury_or_death = req.facts.injury_or_death
    case.police_station = req.facts.police_station
    case.district_state = req.facts.district_state
    case.FIR_cause_narrative = req.facts.FIR_cause_narrative
    case.confirmed = True
    case.status = "Searching"
    
    db.add(AuditLog(
        case_id=case.id,
        action="Facts Confirmed",
        details="Investigator verified claim facts. Commencing query fanout."
    ))
    db.commit()
    
    background_tasks.add_task(run_evidence_search_pipeline, case.id, db)
    
    return case

@app.post("/api/cases/{claim_id}/image", response_model=schemas.ImageMatchResponse)
async def upload_claim_image(
    claim_id: str,
    file: UploadFile = File(...),
    db: Session = Depends(get_db)
):
    case = db.query(Case).filter(Case.claim_id == claim_id).first()
    if not case:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Case with claim ID {claim_id} not found."
        )
        
    filename = f"{case.id}_{file.filename}"
    file_path = os.path.join(UPLOAD_DIR, filename)
    
    try:
        with open(file_path, "wb") as f:
            f.write(await file.read())
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to save image: {str(e)}"
        )
        
    facts = {
        "claim_id": case.claim_id,
        "loss_location": case.loss_location
    }
    match_res = search_engine.check_image_match(file.filename, facts)
    
    img_match = ImageMatch(
        case_id=case.id,
        image_name=file.filename,
        image_path=f"/static/uploads/{filename}",
        status=match_res["status"],
        matched_url=match_res["matched_url"],
        why_matched=match_res["why_matched"]
    )
    db.add(img_match)
    
    db.add(AuditLog(
        case_id=case.id,
        action="Photo Uploaded",
        details=f"Uploaded photo '{file.filename}' for Google Lens trace."
    ))
    db.commit()
    db.refresh(img_match)
    
    return img_match

@app.post("/api/cases/{claim_id}/pushback")
def pushback_case_results_to_quest(
    claim_id: str,
    db: Session = Depends(get_db)
):
    """
    Simulates sending the completed RCU/Investigator findings pack (relevance, mismatch flags,
    summaries, and exported paths) back to the Quest Investigation Portal.
    """
    case = db.query(Case).filter(Case.claim_id == claim_id).first()
    if not case:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Case with claim ID {claim_id} not found."
        )
        
    if case.status != "Completed" and not case.status.startswith("Investigated"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cannot push back. Case investigation must be completed/analyzed first."
        )
        
    timestamp_str = datetime.utcnow().strftime("%Y-%m-%d %H:%M:%S UTC")
    case.pushback_status = "Pushed Successfully"
    case.pushback_timestamp = timestamp_str
    
    # Save pushback transaction to audit log
    db.add(AuditLog(
        case_id=case.id,
        action="Quest API Pushback",
        details=f"Pushed evidence pack to Quest Endpoint. Handshake 200 OK. Transaction ID: TXN-{hash(claim_id) % 1000000}"
    ))
    db.commit()
    db.refresh(case)
    
    return {
        "success": True,
        "message": f"Successfully pushed results for claim {claim_id} to Quest Portal.",
        "pushback_timestamp": timestamp_str
    }

@app.get("/api/cases", response_model=List[schemas.CaseResponse])
def list_cases(db: Session = Depends(get_db)):
    return db.query(Case).order_by(Case.created_at.desc()).all()

@app.get("/api/cases/{claim_id}", response_model=schemas.CaseDetailResponse)
def get_case_detail(claim_id: str, db: Session = Depends(get_db)):
    case = db.query(Case).filter(Case.claim_id == claim_id).first()
    if not case:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Case with claim ID {claim_id} not found."
        )
    return case

@app.put("/api/cases/{claim_id}/status", response_model=schemas.CaseResponse)
def update_case_status(
    claim_id: str,
    req: schemas.ActionRequest,
    db: Session = Depends(get_db)
):
    case = db.query(Case).filter(Case.claim_id == claim_id).first()
    if not case:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Case with claim ID {claim_id} not found."
        )
        
    case.status = req.status
    
    db.add(AuditLog(
        case_id=case.id,
        action="Status Changed",
        details=f"Investigator/RCU marked status as '{req.status}'."
    ))
    db.commit()
    db.refresh(case)
    
    return case

@app.delete("/api/cases/{claim_id}")
def delete_case(claim_id: str, db: Session = Depends(get_db)):
    case = db.query(Case).filter(Case.claim_id == claim_id).first()
    if not case:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Case with claim ID {claim_id} not found."
        )
        
    db.delete(case)
    db.commit()
    return {"message": f"Case {claim_id} deleted successfully."}

@app.get("/api/cases/{claim_id}/export-excel")
def export_case_excel(claim_id: str, db: Session = Depends(get_db)):
    case = db.query(Case).filter(Case.claim_id == claim_id).first()
    if not case:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Case with claim ID {claim_id} not found."
        )
        
    case_data = {
        "claim_id": case.claim_id,
        "policy_information": case.policy_information,
        "supporting_information": case.supporting_information,
        "risk_level": case.risk_level,
        "overall_score": case.overall_score,
        "status": case.status,
        "pushback_status": case.pushback_status,
        "created_at": case.created_at,
        "accident_date_time": case.accident_date_time,
        "loss_location": case.loss_location,
        "vehicle_numbers": case.vehicle_numbers,
        "vehicle_types": case.vehicle_types,
        "parties_involved": case.parties_involved,
        "injury_or_death": case.injury_or_death,
        "police_station": case.police_station,
        "district_state": case.district_state,
        "FIR_cause_narrative": case.FIR_cause_narrative,
        "ai_summary": case.ai_summary,
        "top_mismatches": case.top_mismatches,
        "mismatch_cause": case.mismatch_cause,
        "mismatch_location": case.mismatch_location,
        "mismatch_time": case.mismatch_time,
        "mismatch_vehicle": case.mismatch_vehicle,
        "mismatch_entity": case.mismatch_entity,
        "evidences": [
            {
                "source": ev.source,
                "title": ev.title,
                "url": ev.url,
                "score": ev.score,
                "why_relevant": ev.why_relevant,
                "publish_date": ev.publish_date,
                "query_used": ev.query_used
            } for ev in case.evidences
        ],
        "image_matches": [
            {
                "image_name": im.image_name,
                "status": im.status,
                "matched_url": im.matched_url,
                "why_matched": im.why_matched
            } for im in case.image_matches
        ],
        "audit_logs": [
            {
                "timestamp": al.timestamp,
                "action": al.action,
                "details": al.details
            } for al in case.audit_logs
        ]
    }
    
    excel_stream = exporter.generate_evidence_excel(case_data)
    filename = f"Universal_Sompo_Evidence_Pack_{claim_id.replace('/', '_')}.xlsx"
    
    return StreamingResponse(
        excel_stream,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={
            "Content-Disposition": f"attachment; filename={filename}"
        }
    )

@app.get("/api/cases/{claim_id}/export-pdf", response_class=HTMLResponse)
def export_case_pdf(claim_id: str, db: Session = Depends(get_db)):
    case = db.query(Case).filter(Case.claim_id == claim_id).first()
    if not case:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Case with claim ID {claim_id} not found."
        )
        
    case_data = {
        "claim_id": case.claim_id,
        "policy_information": case.policy_information,
        "supporting_information": case.supporting_information,
        "risk_level": case.risk_level,
        "overall_score": case.overall_score,
        "status": case.status,
        "pushback_status": case.pushback_status,
        "created_at": case.created_at,
        "accident_date_time": case.accident_date_time,
        "loss_location": case.loss_location,
        "vehicle_numbers": case.vehicle_numbers,
        "vehicle_types": case.vehicle_types,
        "parties_involved": case.parties_involved,
        "injury_or_death": case.injury_or_death,
        "police_station": case.police_station,
        "district_state": case.district_state,
        "FIR_cause_narrative": case.FIR_cause_narrative,
        "ai_summary": case.ai_summary,
        "top_mismatches": case.top_mismatches,
        "mismatch_cause": case.mismatch_cause,
        "mismatch_location": case.mismatch_location,
        "mismatch_time": case.mismatch_time,
        "mismatch_vehicle": case.mismatch_vehicle,
        "mismatch_entity": case.mismatch_entity,
        "evidences": [
            {
                "source": ev.source,
                "title": ev.title,
                "url": ev.url,
                "score": ev.score,
                "why_relevant": ev.why_relevant,
                "publish_date": ev.publish_date,
                "query_used": ev.query_used
            } for ev in case.evidences
        ],
        "image_matches": [
            {
                "image_name": im.image_name,
                "status": im.status,
                "matched_url": im.matched_url,
                "why_matched": im.why_matched
            } for im in case.image_matches
        ],
        "audit_logs": [
            {
                "timestamp": al.timestamp,
                "action": al.action,
                "details": al.details
            } for al in case.audit_logs
        ]
    }
    
    html_content = exporter.generate_evidence_html_report(case_data)
    return html_content

@app.get("/api/audit-logs", response_model=List[schemas.AuditLogResponse])
def list_global_audit_logs(db: Session = Depends(get_db)):
    return db.query(AuditLog).order_by(AuditLog.timestamp.desc()).all()

# Try mounting frontend dist directory as static files.
FRONTEND_DIST_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "frontend", "dist")

@app.get("/", response_class=HTMLResponse)
def index_fallback():
    index_path = os.path.join(FRONTEND_DIST_DIR, "index.html")
    if os.path.exists(index_path):
        with open(index_path, "r", encoding="utf-8") as f:
            return f.read()
    else:
        return """
        <!DOCTYPE html>
        <html>
        <head>
            <title>Universal Sompo AI Claim Evidence Finder — Dev Server</title>
            <style>
                body { font-family: 'Segoe UI', sans-serif; background-color: #121212; color: #e0e0e0; display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100vh; margin: 0; }
                h1 { color: #1F4E79; font-size: 32px; margin-bottom: 10px; }
                p { font-size: 18px; color: #888; margin-bottom: 20px; }
                .card { background-color: #1e1e1e; border: 1px solid #333; padding: 25px; border-radius: 8px; box-shadow: 0 4px 6px rgba(0,0,0,0.3); text-align: center; }
                .loader { border: 4px solid #333; border-top: 4px solid #1F4E79; border-radius: 50%; width: 40px; height: 40px; animation: spin 1s linear infinite; margin: 20px auto; }
                @keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }
            </style>
        </head>
        <body>
            <div class="card">
                <h1>Universal Sompo Evidence Finder</h1>
                <p>FastAPI Backend is running successfully on port 8000.</p>
                <div class="loader"></div>
                <p style="font-size:14px; color:#555;">Frontend is not compiled yet. Running the root startup script will compile the React app and mount it here.</p>
            </div>
        </body>
        </html>
        """

if os.path.exists(FRONTEND_DIST_DIR):
    app.mount("/", StaticFiles(directory=FRONTEND_DIST_DIR, html=True), name="frontend")
