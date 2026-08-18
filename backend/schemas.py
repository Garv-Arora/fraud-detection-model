from pydantic import BaseModel
from typing import List, Optional, Dict
from datetime import datetime

class EvidenceBase(BaseModel):
    source: str
    title: Optional[str] = None
    url: Optional[str] = None
    snippet: Optional[str] = None
    score: float = 0.0
    why_relevant: Optional[str] = None
    publish_date: Optional[str] = None
    query_used: Optional[str] = None

class EvidenceResponse(EvidenceBase):
    id: int
    case_id: int

    class Config:
        from_attributes = True

class ImageMatchBase(BaseModel):
    image_name: str
    image_path: Optional[str] = None
    status: str = "Original"
    matched_url: Optional[str] = None
    why_matched: Optional[str] = None

class ImageMatchResponse(ImageMatchBase):
    id: int
    case_id: int

    class Config:
        from_attributes = True

class AuditLogBase(BaseModel):
    action: str
    details: Optional[str] = None
    timestamp: datetime

class AuditLogResponse(AuditLogBase):
    id: int
    case_id: Optional[int] = None

    class Config:
        from_attributes = True

class ClaimFacts(BaseModel):
    claim_id: str
    policy_information: Optional[str] = None
    supporting_information: Optional[str] = None
    
    # 30 Tera Bot Schema attributes
    insured_name: Optional[str] = None
    insured_address: Optional[str] = None
    insured_contact_no: Optional[str] = None
    vehicle_numbers: List[str] = []
    vehicle_make: Optional[str] = None
    vehicle_model: Optional[str] = None
    driver_name: Optional[str] = None
    driver_contact_no: Optional[str] = None
    spot_of_accident: Optional[str] = None
    accident_date_time: Optional[str] = None
    accident_location_city: Optional[str] = None
    accident_location_state: Optional[str] = None
    accident_location_region: Optional[str] = None
    FIR_cause_narrative: Optional[str] = None
    intimation_date: Optional[str] = None
    fir_date: Optional[str] = None
    fir_time: Optional[str] = None
    police_station: Optional[str] = None
    police_station_district: Optional[str] = None
    state: Optional[str] = None
    no_of_occupants: Optional[str] = None
    news_check: Optional[str] = None
    social_media_check: Optional[str] = None
    past_record_vehicle: Optional[str] = None
    call_112_check: Optional[str] = None
    call_108_check: Optional[str] = None
    hospital_name: Optional[str] = None
    crime_check: Optional[str] = None
    io_name: Optional[str] = None

    loss_location: Optional[str] = None
    vehicle_types: List[str] = []
    parties_involved: List[str] = []
    injury_or_death: Optional[str] = None
    district_state: Optional[str] = None

class IngestionFactsResponse(BaseModel):
    facts: ClaimFacts
    confidence_scores: Dict[str, float]

class CaseResponse(BaseModel):
    id: int
    claim_id: str
    policy_information: Optional[str] = None
    supporting_information: Optional[str] = None
    
    insured_name: Optional[str] = None
    insured_address: Optional[str] = None
    insured_contact_no: Optional[str] = None
    vehicle_numbers: Optional[str] = None
    vehicle_make: Optional[str] = None
    vehicle_model: Optional[str] = None
    driver_name: Optional[str] = None
    driver_contact_no: Optional[str] = None
    spot_of_accident: Optional[str] = None
    accident_date_time: Optional[str] = None
    accident_location_city: Optional[str] = None
    accident_location_state: Optional[str] = None
    accident_location_region: Optional[str] = None
    FIR_cause_narrative: Optional[str] = None
    intimation_date: Optional[str] = None
    fir_date: Optional[str] = None
    fir_time: Optional[str] = None
    police_station: Optional[str] = None
    police_station_district: Optional[str] = None
    state: Optional[str] = None
    no_of_occupants: Optional[str] = None
    news_check: Optional[str] = None
    social_media_check: Optional[str] = None
    past_record_vehicle: Optional[str] = None
    call_112_check: Optional[str] = None
    call_108_check: Optional[str] = None
    hospital_name: Optional[str] = None
    crime_check: Optional[str] = None
    io_name: Optional[str] = None

    loss_location: Optional[str] = None
    vehicle_types: Optional[str] = None
    parties_involved: Optional[str] = None
    injury_or_death: Optional[str] = None
    district_state: Optional[str] = None
    confidence_scores: Optional[str] = None
    confirmed: bool
    overall_score: float
    risk_level: str
    status: str
    ai_summary: Optional[str] = None
    pushback_status: str
    pushback_timestamp: Optional[str] = None
    top_mismatches: Optional[str] = None
    mismatch_cause: Optional[str] = None
    mismatch_location: Optional[str] = None
    mismatch_time: Optional[str] = None
    mismatch_vehicle: Optional[str] = None
    mismatch_entity: Optional[str] = None
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True

class CaseDetailResponse(CaseResponse):
    evidences: List[EvidenceResponse] = []
    image_matches: List[ImageMatchResponse] = []
    audit_logs: List[AuditLogResponse] = []

    class Config:
        from_attributes = True

class CaseIngestTextRequest(BaseModel):
    claim_id: str
    fir_text: str

class UpdateFactsRequest(BaseModel):
    facts: ClaimFacts

class ActionRequest(BaseModel):
    status: str

class CustomSearchRequest(BaseModel):
    queries: List[str] = []

class SearchWorkbenchRequest(BaseModel):
    query: Optional[str] = ""
    insured_name: Optional[str] = ""
    vehicle_no: Optional[str] = ""
    location: Optional[str] = ""
    date_str: Optional[str] = ""
    incident_keywords: Optional[str] = ""
    engines: Optional[List[str]] = ["google_news", "duckduckgo", "social", "epaper"]
    strict_accident_filter: Optional[bool] = False
    deep_scrape: Optional[bool] = True

class SearchWorkbenchResultItem(BaseModel):
    title: str
    url: str
    snippet: str
    domain: Optional[str] = None
    source: str
    engine: str
    publish_date: Optional[str] = None
    query_used: str
    relevance_score: float = 50.0
    matched_keywords: List[str] = []
    full_article_text: Optional[str] = None
    is_live: bool = True

class SearchWorkbenchResponse(BaseModel):
    query_executed: List[str]
    keywords_extracted: List[str]
    total_results: int
    execution_time_seconds: float
    results: List[SearchWorkbenchResultItem]
    ai_summary: Optional[str] = None


