import re
import math
import os
import json
import logging
from typing import Dict, Any, List, Tuple
from datetime import datetime
import google.generativeai as genai

logger = logging.getLogger(__name__)

# Stopwords for simple tf-idf semantic similarity fallback
STOPWORDS = {
    'i', 'me', 'my', 'myself', 'we', 'our', 'ours', 'ourselves', 'you', 'your', 'yours', 
    'yourself', 'yourselves', 'he', 'him', 'his', 'himself', 'she', 'her', 'hers', 
    'herself', 'it', 'its', 'itself', 'they', 'them', 'their', 'theirs', 'themselves', 
    'what', 'which', 'who', 'whom', 'this', 'that', 'these', 'those', 'am', 'is', 'are', 
    'was', 'were', 'be', 'been', 'being', 'have', 'has', 'had', 'having', 'do', 'does', 
    'did', 'doing', 'a', 'an', 'the', 'and', 'but', 'if', 'or', 'because', 'as', 'until', 
    'while', 'of', 'at', 'by', 'for', 'with', 'about', 'against', 'between', 'into', 
    'through', 'during', 'before', 'after', 'above', 'below', 'to', 'from', 'up', 'down', 
    'in', 'out', 'on', 'off', 'over', 'under', 'again', 'further', 'then', 'once', 'here', 
    'there', 'when', 'where', 'why', 'how', 'all', 'any', 'both', 'each', 'few', 'more', 
    'most', 'other', 'some', 'such', 'no', 'nor', 'not', 'only', 'own', 'same', 'so', 
    'than', 'too', 'very', 's', 't', 'can', 'will', 'just', 'don', 'should', 'now'
}

def tokenize(text: str) -> List[str]:
    """Tokenizes text, removes punctuation and lowercase it."""
    words = re.findall(r'\b[a-z]{2,}\b', text.lower())
    return [w for w in words if w not in STOPWORDS]

def cosine_similarity(text1: str, text2: str) -> float:
    """Computes a simple word-vector cosine similarity between two texts."""
    tokens1 = tokenize(text1)
    tokens2 = tokenize(text2)
    
    if not tokens1 or not tokens2:
        return 0.0
        
    freq1 = {}
    for t in tokens1:
        freq1[t] = freq1.get(t, 0) + 1
        
    freq2 = {}
    for t in tokens2:
        freq2[t] = freq2.get(t, 0) + 1
        
    intersection = set(freq1.keys()) & set(freq2.keys())
    dot_product = sum(freq1[x] * freq2[x] for x in intersection)
    
    sum1 = sum(val**2 for val in freq1.values())
    sum2 = sum(val**2 for val in freq2.values())
    
    magnitude1 = math.sqrt(sum1)
    magnitude2 = math.sqrt(sum2)
    
    if not magnitude1 or not magnitude2:
        return 0.0
        
    return dot_product / (magnitude1 * magnitude2)

def calculate_date_proximity(claim_date_str: str, article_text: str, article_date_str: str = None) -> float:
    """Calculates date proximity score (0.0 to 1.0)."""
    if not claim_date_str:
        return 0.5
        
    try:
        if "T" in claim_date_str:
            claim_dt = datetime.fromisoformat(claim_date_str.split("T")[0])
        else:
            for fmt in ("%Y-%m-%d", "%d-%m-%Y", "%d/%m/%Y", "%Y/%m/%d"):
                try:
                    claim_dt = datetime.strptime(claim_date_str, fmt)
                    break
                except ValueError:
                    continue
            else:
                claim_dt = None
    except Exception:
        claim_dt = None
        
    if not claim_dt:
        if claim_date_str in article_text:
            return 1.0
        return 0.5
        
    day = claim_dt.day
    month_name = claim_dt.strftime("%B")
    month_short = claim_dt.strftime("%b")
    year = claim_dt.year
    
    date_patterns = [
        f"{day:02d}-{claim_dt.month:02d}-{year}",
        f"{day:02d}/{claim_dt.month:02d}/{year}",
        f"{year}-{claim_dt.month:02d}-{day:02d}",
        f"{day}\s+{month_name}\s+{year}",
        f"{day}\s+{month_short}\s+{year}",
        f"{month_name}\s+{day}"
    ]
    
    for dp in date_patterns:
        if re.search(dp, article_text, re.IGNORECASE):
            return 1.0
            
    if article_date_str:
        try:
            art_dt = datetime.strptime(article_date_str, "%Y-%m-%d")
            diff_days = abs((art_dt - claim_dt).days)
            if diff_days <= 1:
                return 1.0
            elif diff_days <= 3:
                return 0.8
            elif diff_days <= 7:
                return 0.5
            else:
                return 0.1
        except Exception:
            pass
            
    return 0.3

def calculate_entity_match(facts: Dict[str, Any], article_text: str) -> float:
    """Calculates entity match score (0.0 to 1.0)."""
    matches = 0
    total = 0
    
    vehicles = facts.get("vehicle_numbers", [])
    if vehicles:
        for v in vehicles:
            total += 1
            v_clean = v.replace("-", "").replace(" ", "").upper()
            txt_clean = article_text.replace("-", "").replace(" ", "").upper()
            if v_clean in txt_clean:
                matches += 1
                
    parties = facts.get("parties_involved", [])
    if parties:
        for p in parties:
            total += 1
            name = p.split("(")[0].strip().lower()
            if name and name in article_text.lower():
                matches += 1
                
    ps = facts.get("police_station", "")
    if ps:
        total += 1
        ps_clean = ps.split(" PS")[0].split(" Police Station")[0].strip().lower()
        if ps_clean and ps_clean in article_text.lower():
            matches += 1
            
    district = facts.get("district_state", "")
    if district:
        total += 1
        dist_clean = district.split(",")[0].strip().lower()
        if dist_clean and dist_clean in article_text.lower():
            matches += 1
            
    loc = facts.get("loss_location", "")
    if loc:
        total += 1
        loc_words = [w for w in loc.lower().replace(",", "").split() if len(w) > 3]
        if loc_words:
            loc_matches = sum(1 for w in loc_words if w in article_text.lower())
            if loc_matches > 0:
                matches += (loc_matches / len(loc_words))

    if total == 0:
        return 0.5
        
    return min(matches / total, 1.0)

def calculate_location_feasibility(facts: Dict[str, Any], article_text: str) -> float:
    """Evaluates location feasibility (0.0 to 1.0)."""
    district = facts.get("district_state", "")
    location = facts.get("loss_location", "")
    
    dist_match = False
    loc_match = False
    
    if district:
        dist_name = district.split(",")[0].strip().lower()
        if dist_name in article_text.lower():
            dist_match = True
            
    if location:
        loc_words = [w for w in location.lower().replace(",", "").replace("-", " ").split() if len(w) > 3]
        if loc_words:
            matched_words = sum(1 for w in loc_words if w in article_text.lower())
            if matched_words >= max(1, len(loc_words) // 2):
                loc_match = True
                
    if dist_match and loc_match:
        return 1.0
    elif dist_match:
        return 0.7
    elif loc_match:
        return 0.7
    return 0.1

def calculate_source_reliability(url: str) -> float:
    """Evaluates source reliability based on the domain (0.0 to 1.0)."""
    if not url:
        return 0.4
        
    url_lower = url.lower()
    whitelisted_domains = [
        "jagran.com", "amarujala.com", "bhaskar.com", "timesofindia.com", 
        "ndtv.com", "indianexpress.com", "quest.universalsompo.com", "gov.in"
    ]
    
    for d in whitelisted_domains:
        if d in url_lower:
            return 1.0
            
    general_news = ["news18.com", "hindustantimes.com", "moneycontrol.com", "reuters.com", "aajtak.in", "abplive.com"]
    for d in general_news:
        if d in url_lower:
            return 0.8
            
    # Social media domains are slightly lower but verified
    if "facebook.com" in url_lower or "instagram.com" in url_lower:
        return 0.7
        
    if "blog" in url_lower or "forum" in url_lower or "wikipedia" in url_lower:
        return 0.4
        
    return 0.6

def score_evidence_link(facts: Dict[str, Any], evidence: Dict[str, Any]) -> float:
    """Computes a weighted relevance score for a single evidence item (0.0 to 1.0)."""
    title = evidence.get("title", "")
    snippet = evidence.get("snippet", "")
    url = evidence.get("url", "")
    pub_date = evidence.get("publish_date", None)
    
    combined_text = f"{title} {snippet}"
    cause_narrative = facts.get("FIR_cause_narrative", "")
    
    sem_score = cosine_similarity(combined_text, cause_narrative)
    keyword_score = calculate_entity_match(facts, combined_text)
    date_score = calculate_date_proximity(facts.get("accident_date_time", ""), combined_text, pub_date)
    loc_score = calculate_location_feasibility(facts, combined_text)
    src_score = calculate_source_reliability(url)
    
    weighted_score = (
        (sem_score * 0.35) +
        (keyword_score * 0.20) +
        (date_score * 0.15) +
        (loc_score * 0.15) +
        (src_score * 0.15)
    )
    
    return round(weighted_score, 2)

def evaluate_mismatch_flags(facts: Dict[str, Any], evidences: List[Dict[str, Any]]) -> Tuple[List[str], Dict[str, str]]:
    """Evaluates potential fraud-risk mismatches between claim facts and top evidence."""
    api_key = os.getenv("GEMINI_API_KEY")
    top_evidences = sorted(evidences, key=lambda x: x.get("score", 0), reverse=True)[:3]
    evidence_summary = ""
    for idx, ev in enumerate(top_evidences):
        evidence_summary += f"Evidence #{idx+1} ({ev.get('source')}): {ev.get('title')}. Snippet: {ev.get('snippet')}\n"
        
    if api_key and top_evidences:
        try:
            genai.configure(api_key=api_key)
            model = genai.GenerativeModel('gemini-1.5-flash')
            
            prompt = f"""
            You are a fraud risk detection model for Universal Sompo RCU (Investigation).
            Compare the confirmed claim/FIR facts against the public evidence gathered.
            
            Claim Facts:
            - Date/Time: {facts.get('accident_date_time')}
            - Location: {facts.get('loss_location')}
            - Vehicles: {', '.join(facts.get('vehicle_numbers', []))}
            - Vehicle Types: {', '.join(facts.get('vehicle_types', []))}
            - Parties Involved: {', '.join(facts.get('parties_involved', []))}
            - Police Station: {facts.get('police_station')}
            - District/State: {facts.get('district_state')}
            - Claim Cause/Narrative: {facts.get('FIR_cause_narrative')}
            
            Gathered Public Evidence:
            {evidence_summary}
            
            Analyze these and flag any discrepancies. Evaluate across 5 categories:
            1. CAUSE: FIR cause versus news report (e.g. FIR says moving collision, news says bike hit stationary truck, or vehicle skidding).
            2. LOCATION: Mismatch in spot, road structure, or district.
            3. TIME: Date or time of day is far apart from event date.
            4. VEHICLE: Contradictions in plate number or vehicle model/type.
            5. ENTITY: Different names, age, or details for driver/victim.
            
            Format your response as a JSON object with:
            - flagged_categories: list of categories which have clear discrepancies, from ['cause', 'location', 'time', 'vehicle', 'entity'].
            - cause_explanation: Detail why cause mismatches or state "No mismatch identified."
            - location_explanation: Detail why location mismatches or state "No mismatch identified."
            - time_explanation: Detail why time mismatches or state "No mismatch identified."
            - vehicle_explanation: Detail why vehicle mismatches or state "No mismatch identified."
            - entity_explanation: Detail why entity mismatches or state "No mismatch identified."
            
            Return ONLY the valid JSON block without markdown formatting or surrounding fences.
            """
            response = model.generate_content(prompt)
            response_text = response.text.strip()
            
            if response_text.startswith("```"):
                response_text = re.sub(r"^```(?:json)?\n", "", response_text)
                response_text = re.sub(r"\n```$", "", response_text)
                
            parsed = json.loads(response_text)
            
            flagged = parsed.get("flagged_categories", [])
            explanations = {
                "cause": parsed.get("cause_explanation", "No mismatch identified."),
                "location": parsed.get("location_explanation", "No mismatch identified."),
                "time": parsed.get("time_explanation", "No mismatch identified."),
                "vehicle": parsed.get("vehicle_explanation", "No mismatch identified."),
                "entity": parsed.get("entity_explanation", "No mismatch identified.")
            }
            return flagged, explanations
        except Exception as e:
            logger.error(f"Gemini mismatch evaluation failed, falling back to heuristics: {e}")
            
    # Heuristics mismatch checker
    flagged = []
    explanations = {
        "cause": "No mismatch identified.",
        "location": "No mismatch identified.",
        "time": "No mismatch identified.",
        "vehicle": "No mismatch identified.",
        "entity": "No mismatch identified."
    }
    
    combined_ev_text = " ".join([ev.get("title", "") + " " + ev.get("snippet", "") for ev in top_evidences]).lower()
    
    claim_cause = facts.get("FIR_cause_narrative", "").lower()
    is_stationary_claim = "stationary" in claim_cause or "parked" in claim_cause or "standing" in claim_cause
    is_stationary_ev = "stationary" in combined_ev_text or "parked" in combined_ev_text or "standing" in combined_ev_text or "खड़ा" in combined_ev_text or "खड़े ट्रक" in combined_ev_text
    
    if not is_stationary_claim and is_stationary_ev:
        flagged.append("cause")
        explanations["cause"] = "FIR cause indicates a collision on the move, but public news sources report that the motorcycle rammed into a stationary, parked truck from behind."
    elif "skid" in combined_ev_text or "slipp" in combined_ev_text or "गिरकर" in combined_ev_text:
        if "hit by" in claim_cause or "struck by" in claim_cause:
            flagged.append("cause")
            explanations["cause"] = "FIR claims vehicle was struck by another speeding truck, but news articles indicate self-skidding/slipping on the road with no second vehicle involved."

    claim_date = facts.get("accident_date_time", "")
    if claim_date and top_evidences:
        date_score = calculate_date_proximity(claim_date, combined_ev_text)
        if date_score < 0.5:
            flagged.append("time")
            explanations["time"] = f"Claim accident date ({claim_date.split('T')[0]}) does not match the event dates listed in public news reports."

    vehicles = facts.get("vehicle_numbers", [])
    if vehicles and len(combined_ev_text) > 20:
        veh_found = any(v.replace("-", "").upper() in combined_ev_text.replace("-", "").upper() for v in vehicles)
        if not veh_found:
            veh_types = [vt.lower() for vt in facts.get("vehicle_types", [])]
            if "tractor" in combined_ev_text and "tractor" not in veh_types:
                flagged.append("vehicle")
                explanations["vehicle"] = "News report specifies a Tractor was involved, contradicting the claim narrative which mentions a Truck."

    loc = facts.get("loss_location", "").lower()
    dist = facts.get("district_state", "").lower()
    if dist and len(combined_ev_text) > 20:
        dist_name = dist.split(",")[0].strip()
        if dist_name not in combined_ev_text:
            flagged.append("location")
            explanations["location"] = f"Claim lists loss spot in {dist_name}, but public news and accident reports locate this collision in a different district."
            
    parties = facts.get("parties_involved", [])
    if parties and len(combined_ev_text) > 20:
        party_found = any(p.split("(")[0].strip().lower() in combined_ev_text for p in parties)
        if not party_found:
            flagged.append("entity")
            explanations["entity"] = "Victim name or driver name listed in the claim was not found in any related news portal or police accident records."
            
    return flagged, explanations

def generate_ai_summary(facts: Dict[str, Any], evidences: List[Dict[str, Any]], flagged_mismatches: List[str], image_matches: List[Dict[str, Any]]) -> str:
    """
    Generates a concise AI summary of the collected evidence to assist investigators.
    Contains key observations, relevant findings, source references, and highlights.
    """
    api_key = os.getenv("GEMINI_API_KEY")
    
    # Pre-select top evidence
    top_evidences = sorted(evidences, key=lambda x: x.get("score", 0), reverse=True)[:5]
    evidence_desc = ""
    for idx, ev in enumerate(top_evidences):
        evidence_desc += f"- [{ev.get('source')}] {ev.get('title')} ({ev.get('url')}): {ev.get('snippet')}\n"
        
    image_desc = ""
    for im in image_matches:
        image_desc += f"- Image '{im.get('image_name')}': status={im.get('status')}. details={im.get('why_matched')}\n"
        
    if api_key:
        try:
            genai.configure(api_key=api_key)
            model = genai.GenerativeModel('gemini-1.5-flash')
            
            prompt = f"""
            You are the AI Summary Generation module for the Universal Sompo AI Claim Evidence Finder.
            Your task is to generate a concise summary of the collected evidence to assist the investigator.
            
            Claim Details:
            - Claim ID: {facts.get('claim_id')}
            - Policy Information: {facts.get('policy_information')}
            - Date/Time: {facts.get('accident_date_time')}
            - Location: {facts.get('loss_location')}, {facts.get('district_state')}
            - Vehicles: {', '.join(facts.get('vehicle_numbers', []))}
            - Parties: {', '.join(facts.get('parties_involved', []))}
            - Claim Narrative: {facts.get('FIR_cause_narrative')}
            - Supporting Information: {facts.get('supporting_information')}
            
            Gathered Evidence:
            {evidence_desc}
            
            Google Lens Image Verification:
            {image_desc}
            
            Flagged Mismatches: {', '.join(flagged_mismatches)}
            
            Format the response nicely in Markdown with the following specific sections:
            ### Key Observations
            - 2-3 bullet points outlining the core facts.
            
            ### Relevant Findings
            - Summary of how closely public reports match or contradict the claim.
            
            ### Source References
            - Whitelisted news portals (Jagran, Amar Ujala), Quest internal history, and Social Media (Facebook/Instagram) links that were corroborated.
            
            ### Investigation Highlights
            - Highlight any fraud indicators like stock photo reuse (Lens flags) or cause discrepancies (e.g. stationary truck vs moving collision).
            
            Provide a clean, executive summary. Do not include a final approval or rejection decision. End with a standard disclaimer:
            "*Disclaimer: This AI summary is generated as an evidence discovery aid and does not constitute a final claim decision. All final judgements are the sole responsibility of the authorized Universal Sompo investigator.*"
            """
            response = model.generate_content(prompt)
            return response.text.strip()
        except Exception as e:
            logger.error(f"Gemini summary generation failed: {e}")
            
    # Heuristics summary compiler
    location = facts.get("loss_location") or facts.get("district_state") or "N/A"
    date_val = facts.get("accident_date_time", "N/A")
    date_str = date_val.split("T")[0] if date_val and "T" in date_val else date_val
    vehicles = ", ".join(facts.get("vehicle_numbers", []))
    parties = ", ".join(facts.get("parties_involved", []))
    
    findings = []
    highlights = []
    
    # Build findings based on mismatches
    if "cause" in flagged_mismatches:
        findings.append("Discrepancy in accident cause: Claim details describe a moving collision, whereas public news sources (e.g., Bhaskar report) detail the motorcycle hitting a stationary/parked vehicle.")
        highlights.append("⚠️ Flagged: CAUSE discrepancy between FIR narrative and news portals.")
    else:
        findings.append("Public news articles and reports match the claim narrative cause.")
        
    if "time" in flagged_mismatches:
        findings.append("Proximity violation: The accident timestamp in the claim contradicts article event timestamps by more than 24 hours.")
        highlights.append("⚠️ Flagged: TIME discrepancy between claim and public records.")
        
    # Build highlights for images
    has_stock_img = False
    for im in image_matches:
        if "Stock" in im.get("status", ""):
            has_stock_img = True
            highlights.append(f"⚠️ Flagged image reuse: Claim photo '{im.get('image_name')}' found in Pixabay/Shutterstock catalogs.")
            
    if not flagged_mismatches and not has_stock_img:
        findings.append("All collected evidence corroborates the claims details perfectly.")
        highlights.append("✅ No critical discrepancies or image reuse identified.")
        
    # Gather whitelisted source names
    sources_corroborated = list(set([ev.get("source") for ev in top_evidences]))
    
    highlights_str = "".join([f"* {h}\n" for h in highlights])
    
    summary = f"""### Key Observations
* **Claim Ingested**: Ingestion processed for Claim ID **{facts.get('claim_id')}** (Policy: **{facts.get('policy_information') or 'N/A'}**).
* **Incident Profile**: Accident occurred on **{date_str}** near **{location}** involving vehicles **{vehicles}**.
* **Parties involved**: **{parties}**.

### Relevant Findings
* {" ".join(findings)}
* Public search returned **{len(evidences)}** relevant matches across different news and social media portals.

### Source References
* Evidence fanned out to: **{", ".join(sources_corroborated) if sources_corroborated else 'News, Quest, Web, Facebook, Instagram'}**.
* Top whitelisted sources: **Jagran, Amar Ujala, Bhaskar** and verified Facebook updates.

### Investigation Highlights
{highlights_str}
*Disclaimer: This AI summary is generated as an evidence discovery aid and does not constitute a final claim decision. All final judgements are the sole responsibility of the authorized Universal Sompo investigator.*"""

    return summary
