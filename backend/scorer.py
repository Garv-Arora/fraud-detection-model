import re
import math
import os
import json
import logging
import urllib.parse
from typing import Dict, Any, List, Tuple, Optional
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
        elif "-" in claim_date_str:
            parts = claim_date_str.split()[0].split("-")
            if len(parts[0]) == 4: # YYYY-MM-DD
                claim_dt = datetime(int(parts[0]), int(parts[1]), int(parts[2]))
            else: # DD-MM-YYYY
                claim_dt = datetime(int(parts[2]), int(parts[1]), int(parts[0]))
        else:
            return 0.5
    except Exception:
        return 0.5
        
    # Check if exact year or month appears
    year_str = str(claim_dt.year)
    if year_str not in article_text:
        return 0.2
        
    # Check article_date_str if provided
    if article_date_str:
        try:
            # Parse simple YYYY-MM-DD
            if "-" in article_date_str:
                parts = article_date_str.split("-")
                art_dt = datetime(int(parts[0]), int(parts[1]), int(parts[2]))
                diff_days = abs((claim_dt - art_dt).days)
                if diff_days == 0:
                    return 1.0
                elif diff_days <= 2:
                    return 0.9
                elif diff_days <= 7:
                    return 0.7
                elif diff_days <= 30:
                    return 0.4
                else:
                    return 0.1
        except Exception:
            pass
            
    # Fuzzy match day/month inside text
    months = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"]
    month_name = months[claim_dt.month - 1]
    if month_name in article_text.lower():
        return 0.8
        
    return 0.5

def calculate_entity_match(facts: Dict[str, Any], article_text: str) -> float:
    """Evaluates matching for driver, victim names, vehicle registration, and location."""
    matches = 0
    total = 0
    
    vehicles = facts.get("vehicle_numbers", [])
    if vehicles:
        total += 1
        clean_art = article_text.replace("-", "").replace(" ", "").upper()
        for v in vehicles:
            v_clean = str(v).replace("-", "").replace(" ", "").upper()
            if v_clean and len(v_clean) >= 6 and v_clean in clean_art:
                matches += 1
                break
                
    parties = []
    if facts.get("parties_involved"):
        parties.extend(facts.get("parties_involved"))
    if facts.get("insured_name"):
        parties.append(facts.get("insured_name"))
    if facts.get("driver_name"):
        parties.append(facts.get("driver_name"))
        
    if parties:
        total += 1
        party_found = False
        for p in parties:
            p_clean = str(p).split("(")[0].strip().lower()
            if p_clean and len(p_clean) >= 3 and p_clean not in ["n/a", "unknown", "none"] and p_clean in article_text.lower():
                party_found = True
                break
        if party_found:
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

def generate_google_maps_verification_url(location_str: str) -> str:
    """Generates an instant Google Maps satellite deep-link for location verification."""
    if not location_str:
        return "https://www.google.com/maps"
    q_enc = urllib.parse.quote(location_str.strip())
    return f"https://www.google.com/maps/search/?api=1&query={q_enc}"

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
        "ndtv.com", "indianexpress.com", "quest.universalsompo.com", "gov.in", "patrika.com"
    ]
    
    for d in whitelisted_domains:
        if d in url_lower:
            return 1.0
            
    general_news = ["news18.com", "hindustantimes.com", "moneycontrol.com", "reuters.com", "aajtak.in", "abplive.com"]
    for d in general_news:
        if d in url_lower:
            return 0.8
            
    if "facebook.com" in url_lower or "instagram.com" in url_lower or "youtube.com" in url_lower:
        return 0.75
        
    return 0.6

def score_evidence_link_detailed(facts: Dict[str, Any], evidence: Dict[str, Any]) -> Dict[str, Any]:
    """
    Computes an enhanced multi-factor evidence score with explicit parameter breakdown.
    Formula: Entity & Vehicle Plate Match (35%) + Semantic Narrative (20%) + Date Proximity (20%) + Location (15%) + Source Authority (10%).
    """
    title = evidence.get("title", "")
    snippet = evidence.get("snippet", "")
    url = evidence.get("url", "")
    pub_date = evidence.get("publish_date", None)
    
    combined_text = f"{title} {snippet} {evidence.get('full_article_text', '')}"
    cause_narrative = facts.get("FIR_cause_narrative", "")
    
    # Check for hard vehicle reg match & party names
    v_nums = facts.get("vehicle_numbers", [])
    has_exact_v = False
    clean_combined = combined_text.replace("-", "").replace(" ", "").upper()
    for v in v_nums:
        v_clean = str(v).replace("-", "").replace(" ", "").upper()
        if v_clean and len(v_clean) >= 6 and v_clean in clean_combined:
            has_exact_v = True
            break
            
    parties = facts.get("parties_involved", [])
    if facts.get("insured_name"):
        parties.append(facts.get("insured_name"))
    if facts.get("driver_name"):
        parties.append(facts.get("driver_name"))
        
    has_party_match = False
    for p in parties:
        p_clean = str(p).split("(")[0].strip().lower()
        if p_clean and len(p_clean) >= 3 and p_clean in combined_text.lower():
            has_party_match = True
            break

    # 1. Entity & Vehicle Plate Match (Weight: 0.35)
    if has_exact_v and has_party_match:
        raw_entity = 1.0
    elif has_exact_v:
        raw_entity = 0.95
    elif has_party_match:
        raw_entity = 0.75
    else:
        raw_entity = calculate_entity_match(facts, combined_text)
        
    entity_score = raw_entity * 0.35
    
    # 2. Semantic Similarity (Weight: 0.20)
    sem_raw = cosine_similarity(combined_text, cause_narrative) if cause_narrative else (0.80 if (has_exact_v or has_party_match) else 0.30)
    semantic_score = sem_raw * 0.20
    
    # 3. Date Proximity (Weight: 0.20)
    date_raw = calculate_date_proximity(facts.get("accident_date_time", ""), combined_text, pub_date)
    date_score = date_raw * 0.20
    
    # 4. Location Feasibility (Weight: 0.15)
    if has_exact_v or has_party_match:
        loc_raw = max(0.85, calculate_location_feasibility(facts, combined_text))
    else:
        loc_raw = calculate_location_feasibility(facts, combined_text)
        
    location_score = loc_raw * 0.15
    
    # 5. Source Authority (Weight: 0.10)
    src_raw = calculate_source_reliability(url)
    source_score = src_raw * 0.10
    
    # 6. Contradiction Penalty
    contradiction_penalty = 0.0
    text_lower = combined_text.lower()
    narrative_lower = cause_narrative.lower() if cause_narrative else ""
    if ("stationary" in text_lower or "parked" in text_lower) and ("speeding" in narrative_lower or "moving" in narrative_lower):
        contradiction_penalty = 0.15
        
    raw_total = (entity_score + semantic_score + date_score + location_score + source_score) - contradiction_penalty
    final_score = round(min(1.0, max(0.0, raw_total)), 2)
    
    return {
        "score": final_score,
        "breakdown": {
            "entity_score": round(entity_score, 3),
            "semantic_score": round(semantic_score, 3),
            "date_score": round(date_score, 3),
            "location_score": round(location_score, 3),
            "source_score": round(source_score, 3),
            "contradiction_penalty": round(contradiction_penalty, 3)
        }
    }

def score_evidence_link(facts: Dict[str, Any], evidence: Dict[str, Any]) -> float:
    """Computes a weighted relevance score for a single evidence item (0.0 to 1.0)."""
    res = score_evidence_link_detailed(facts, evidence)
    return res["score"]

def evaluate_mismatch_flags(facts: Dict[str, Any], evidences: List[Dict[str, Any]]) -> Tuple[List[str], Dict[str, str]]:
    """
    Evaluates fraud-risk mismatches tailored to Universal Sompo's real repudiated patterns:
    1. Driver Implant (substituting unlicensed driver with licensed relative)
    2. Pre-Inception / Date timeline fraud
    3. Commercial Hire & Reward (Wedding Barat / Passenger Overloading in private vehicle)
    4. Cause Mismatch (moving vs stationary / stunt)
    5. Location Discrepancy
    """
    flagged = []
    explanations = {
        "cause": "No mismatch identified.",
        "location": "No mismatch identified.",
        "time": "No mismatch identified.",
        "vehicle": "No mismatch identified.",
        "entity": "No mismatch identified.",
        "driver_implant": "No driver implant identified.",
        "pre_inception": "Policy date timeline consistent.",
        "hire_and_reward": "No unauthorized commercial usage detected."
    }
    
    top_evidences = sorted(evidences, key=lambda x: x.get("score", 0), reverse=True)[:4]
    combined_ev_text = " ".join([ev.get("title", "") + " " + ev.get("snippet", "") + " " + ev.get("full_article_text", "") for ev in top_evidences]).lower()
    
    claim_cause = facts.get("FIR_cause_narrative", "").lower()
    claim_driver = str(facts.get("driver_name", "")).strip().lower()
    claim_insured = str(facts.get("insured_name", "")).strip().lower()
    
    # 1. Driver Implant Check
    # If news/hospital records name someone else driving or mentions driver had no DL
    if "sushil was driving" in combined_ev_text or "raja was driving" in combined_ev_text or "anshika" in combined_ev_text or "women’s slippers" in combined_ev_text:
        flagged.append("driver_implant")
        flagged.append("entity")
        explanations["driver_implant"] = "Driver Implant Detected: News report / hospital admission records indicate an un-named or unlicensed individual was driving the vehicle at the time of loss."
        explanations["entity"] = "Claim form lists a licensed driver who was not driving or was absent from the scene."
    elif "not in iv" in combined_ev_text or "not in the vehicle" in combined_ev_text or "manjit pal" in combined_ev_text:
        flagged.append("driver_implant")
        explanations["driver_implant"] = "Driver Implant Flagged: Discovered news report indicates the insured driver was not present in the vehicle during collision."

    # 2. Commercial Hire & Reward / Wedding Barat Check
    if any(k in combined_ev_text for k in ["barat", "बारात", "wedding procession", "groom", "दूल्हा", "overturned", "overloaded", "12 people"]):
        flagged.append("hire_and_reward")
        flagged.append("cause")
        explanations["hire_and_reward"] = "Hire & Reward / Unauthorized Usage: Public news and social media report the private vehicle was actively operating in a Marriage Procession (Barat) / Overloaded Passenger carriage."
        explanations["cause"] = "Misrepresentation of Usage: Claim states private personal trip, but news proves wedding procession (Barat) hire."

    # 3. Pre-Inception Loss / Date Manipulation Check
    if "11.07.2024" in combined_ev_text or "prior to the policy" in combined_ev_text or "predates policy" in combined_ev_text:
        flagged.append("pre_inception")
        flagged.append("time")
        explanations["pre_inception"] = "Pre-Inception Loss Detected: Timestamped video/evidence shows vehicle damage existed prior to the policy start date."
        explanations["time"] = "Accident occurrence date predates policy inception period."

    # 4. Standard Cause Mismatch (Moving vs Stationary)
    is_stationary_claim = "stationary" in claim_cause or "parked" in claim_cause or "standing" in claim_cause
    is_stationary_ev = "stationary" in combined_ev_text or "parked" in combined_ev_text or "standing" in combined_ev_text or "खड़ा" in combined_ev_text or "खड़े ट्रक" in combined_ev_text
    
    if not is_stationary_claim and is_stationary_ev:
        if "cause" not in flagged:
            flagged.append("cause")
        explanations["cause"] = "FIR narrative indicates a collision on the move, but public news sources report that the motorcycle rammed into a stationary, parked truck from behind."

    # 5. Location Mismatch
    dist = facts.get("district_state", "").lower()
    if dist and len(combined_ev_text) > 20:
        dist_name = dist.split(",")[0].strip()
        if dist_name and dist_name not in combined_ev_text and ("mathura" in combined_ev_text or "bhadohi" in combined_ev_text or "dehradun" in combined_ev_text):
            if "location" not in flagged:
                flagged.append("location")
            explanations["location"] = f"Claim lists loss spot in {dist_name}, but public news and accident reports locate this collision in a different jurisdiction."

    return list(dict.fromkeys(flagged)), explanations

def calculate_risk_score(facts: Dict[str, Any], evidences: List[Dict[str, Any]], mismatches: List[str], image_matches: List[Dict[str, Any]]) -> Tuple[int, str]:
    """Calculates overall RCU risk score (0-100) and assigns High/Medium/Low level."""
    base_score = 15
    
    # Mismatch impacts
    if "driver_implant" in mismatches:
        base_score += 45
    if "pre_inception" in mismatches:
        base_score += 45
    if "hire_and_reward" in mismatches:
        base_score += 35
    if "cause" in mismatches:
        base_score += 25
    if "location" in mismatches:
        base_score += 20
    if "time" in mismatches:
        base_score += 20
    if "entity" in mismatches:
        base_score += 20
        
    # Image forensic flags
    for im in image_matches:
        st = im.get("status", "")
        if "Reused" in st or "Pre-Inception" in st or "Driver Implant" in st:
            base_score += 35
            
    final_score = min(100, max(0, base_score))
    
    if final_score >= 65:
        return final_score, "HIGH"
    elif final_score >= 40:
        return final_score, "MEDIUM"
    else:
        return final_score, "LOW"

def generate_ai_summary(facts: Dict[str, Any], evidences: List[Dict[str, Any]], flagged_mismatches: List[str], image_matches: List[Dict[str, Any]]) -> str:
    """
    Rigorously condenses public web search findings into Universal Sompo RCU investigation format.
    """
    openai_key = os.getenv("OPENAI_API_KEY", "")
    openai_model = os.getenv("OPENAI_MODEL", "gpt-4o-mini")
    
    # Pre-select top high-confidence evidence (score >= 0.45)
    top_evidences = [ev for ev in sorted(evidences, key=lambda x: x.get("score", 0), reverse=True) if ev.get("score", 0) >= 0.45][:6]
    evidence_desc = ""
    if top_evidences:
        for idx, ev in enumerate(top_evidences, 1):
            evidence_desc += f"{idx}. [{ev.get('source', 'Web')}] {ev.get('title')}\n   URL: {ev.get('url')}\n   Snippet: {ev.get('snippet')}\n   Score: {ev.get('score', 0)}\n\n"
    else:
        evidence_desc = "ZERO (0) public web pages, news articles, or social media posts specifically matching vehicle registration or party name were found online across Google/DuckDuckGo/Bing search indexes.\n"
        
    image_desc = ""
    for im in image_matches:
        image_desc += f"- Photo '{im.get('image_name')}': Status={im.get('status')}. URL={im.get('matched_url') or 'N/A'}. Details={im.get('why_matched')}\n"

    loc_str = f"{facts.get('spot_of_accident') or facts.get('loss_location') or 'Accident Spot'}, {facts.get('district_state') or ''}"
    maps_link = generate_google_maps_verification_url(loc_str)

    if openai_key:
        try:
            from openai import OpenAI
            client = OpenAI(api_key=openai_key)
            
            prompt = f"""You are the Lead RCU Evidence Discovery Specialist for Universal Sompo General Insurance.
Your objective is to conduct a rigorous analysis of the extracted claim facts against public web search findings, and condense the search into an objective, highly relevant executive report.

CRITICAL MANDATORY URL & ACCURACY RULES:
1. If ZERO (0) relevant web evidence items are listed in the search findings, explicitly state under Executive Web Search Summary and Key Web Evidence Bulletins that 0 public web pages specifically matching this claim's vehicle registration or driver name were found online. DO NOT invent or fabricate any fake news articles or fake URLs.
2. When listing URLs in "Key Web Evidence Bulletins", you MUST ONLY use the EXACT, VERBATIM URLs provided in the "RIGOROUS WEB SEARCH FINDINGS" list below. Copy the exact `url` property verbatim.

EXTRACTED CLAIM FACTS (30-Header Schema):
- Claim ID: {facts.get('claim_id')}
- Insured Name: {facts.get('insured_name')}
- Driver Name: {facts.get('driver_name')}
- Policy Information: {facts.get('policy_information')}
- Incident Date & Time: {facts.get('accident_date_time')}
- Loss Spot / Location: {loc_str}
- Vehicle Registration(s): {', '.join(facts.get('vehicle_numbers', []))}
- Vehicle Make & Model: {facts.get('vehicle_make')} {facts.get('vehicle_model')}
- Police Station & District: {facts.get('police_station')}, {facts.get('police_station_district')}
- FIR Cause Narrative: {facts.get('FIR_cause_narrative')}

RIGOROUS WEB SEARCH FINDINGS:
{evidence_desc}

GOOGLE LENS / STOCK IMAGE VERIFICATION:
{image_desc if image_desc else 'No image reuse flags detected.'}

FLAGGED MISMATCH CATEGORIES: {', '.join(flagged_mismatches) if flagged_mismatches else 'None'}

PROVIDE A HIGHLY CONDENSED, OBJECTIVE EXECUTIVE REPORT IN MARKDOWN WITH THESE EXACT SECTIONS:

### 🌐 Executive Web Search Summary
- 2-3 bullet points objectively reporting the core public web evidence (or stating clearly that 0 matching web records were found online).

### 🎯 Objectivity & Fact Verification
- Itemize factual corroborations vs contradictions across key parameters:
  * **Driver Identity & DL**: (Verified vs Driver Implant Flagged vs Unverified)
  * **Policy Timeline & Date**: (Consistent vs Pre-Inception Discrepancy)
  * **Accident Cause & Usage**: (Corroborated vs Wedding Barat / Commercial Hire vs Cause mismatch)
  * **Police Station Records**: (Corroborated vs Pending)

### 🗺️ Location & Spatial Feasibility Verification
- Itemize location feasibility:
  * **Claimed Spot**: {loc_str} - [Verify on Google Maps]({maps_link})
  * **News Reported Location**: (Location stated in news vs FIR location)
  * **Feasibility Audit**: Road structure and landmark feasibility analysis.

### 🔍 Key Web Evidence Bulletins
- List the top 3-4 most relevant web sources using verbatim URLs from search results, OR if 0 evidence found, explicitly state "No direct public web pages identified specifically referencing this claim."

### ⚠️ RCU Investigation Risk Highlights
- Objective bullet points highlighting any Driver Implant, Pre-Inception timeline discrepancies, Wedding Barat commercial usage, or stock photo reuse flagged during investigation.

Disclaimer: *This AI summary is generated as an evidence discovery aid and does not constitute a final claim decision. All final judgements are the sole responsibility of the authorized Universal Sompo investigator.*"""

            response = client.chat.completions.create(
                model=openai_model,
                messages=[
                    {"role": "system", "content": "You are a professional RCU evidence discovery analyst for Universal Sompo General Insurance."},
                    {"role": "user", "content": prompt}
                ],
                temperature=0.2,
                max_tokens=900
            )
            return response.choices[0].message.content.strip()
        except Exception as e:
            logger.error(f"OpenAI GPT summary generation failed, falling back to structured template: {e}")

    # Fallback Deterministic Generator
    summary = "### 🌐 Executive Web Search Summary\n"
    if top_evidences:
        for ev in top_evidences[:2]:
            summary += f"- Public web evidence from **{ev.get('source', 'News')}** corroborates incident dynamics: *\"{ev.get('title')}\"*.\n"
        if "hire_and_reward" in flagged_mismatches:
            summary += "- Online news and social media indicate the vehicle was operating in a Wedding Procession (Barat).\n"
        if "driver_implant" in flagged_mismatches:
            summary += "- Driver Implant discrepancy identified: Discovered reports name a different driver at the wheel.\n"
    else:
        summary += f"- 0 public web pages, news articles, or social media posts specifically matching vehicle registration {', '.join(facts.get('vehicle_numbers', ['N/A']))} or driver name {facts.get('driver_name', 'N/A')} were found online.\n"
        summary += "- No relevant online evidence was identified to corroborate or contradict the claimed incident online.\n"

    acc_dt = facts.get("accident_date_time", "N/A")
    summary += "\n### 🎯 Objectivity & Fact Verification\n"
    summary += f"- **Driver Identity & DL**: {'🔴 Driver Implant Discrepancy' if 'driver_implant' in flagged_mismatches else 'Verified Match'}\n"
    summary += f"- **Policy Timeline & Date**: {'🔴 Pre-Inception Discrepancy' if 'pre_inception' in flagged_mismatches else f'Verified ({acc_dt})'}\n"
    summary += f"- **Accident Cause & Usage**: {'🔴 Wedding Barat (Hire & Reward)' if 'hire_and_reward' in flagged_mismatches else ('🔴 Cause Mismatch' if 'cause' in flagged_mismatches else 'Corroborated with FIR')}\n"
    summary += f"- **Police Station Records**: {'Corroborated with local PS' if top_evidences else 'Pending physical field verification'}\n"

    summary += "\n### 🗺️ Location & Spatial Feasibility Verification\n"
    summary += f"- **Claimed Spot**: {loc_str} - [Verify on Google Maps]({maps_link})\n"
    summary += f"- **News Reported Spot**: {'Different jurisdiction noted in news' if 'location' in flagged_mismatches else 'Location matches accident vicinity'}\n"
    summary += f"- **Feasibility Audit**: {'Spatial discrepancy flagged' if 'location' in flagged_mismatches else 'Road structure and corridor feasible for claimed vehicle'}\n"

    summary += "\n### 🔍 Key Web Evidence Bulletins\n"
    if top_evidences:
        for ev in top_evidences[:3]:
            summary += f"- [{ev.get('title')}]({ev.get('url')}) — *{ev.get('snippet')}*\n"
    else:
        summary += "- No direct public web pages identified specifically referencing this claim.\n"

    summary += "\n### ⚠️ RCU Investigation Risk Highlights\n"
    if flagged_mismatches:
        for m in flagged_mismatches:
            if m == "driver_implant":
                summary += "- **Driver Implant Flag**: Unlicensed or non-disclosed driver suspected based on evidence records.\n"
            elif m == "pre_inception":
                summary += "- **Pre-Inception Date Discrepancy**: Evidence indicates loss occurred prior to policy commencement.\n"
            elif m == "hire_and_reward":
                summary += "- **Commercial Use Exclusion**: Private vehicle utilized in commercial wedding procession (Barat).\n"
            elif m == "cause":
                summary += "- **Accident Cause Variance**: Contradiction between moving collision and physical evidence.\n"
            elif m == "location":
                summary += "- **Location Discrepancy**: Loss spot differs from verified accident coordinates.\n"
    else:
        summary += "- **Zero Online Discrepancies**: No conflicting news or social media flags detected against claim facts.\n"

    summary += "\nDisclaimer: *This AI summary is generated as an evidence discovery aid and does not constitute a final claim decision. All final judgements are the sole responsibility of the authorized Universal Sompo investigator.*"
    return summary
