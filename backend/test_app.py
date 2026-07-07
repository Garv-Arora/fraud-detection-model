import os
import json
import unittest
from datetime import datetime
from backend.extractor import extract_facts_from_text
from backend.search_engine import generate_search_queries, check_image_match
from backend.scorer import score_evidence_link, evaluate_mismatch_flags, cosine_similarity, generate_ai_summary
from backend.exporter import generate_evidence_excel

class TestClaimEvidenceFinder(unittest.TestCase):
    
    def setUp(self):
        self.sample_text = """
        FIR Details:
        Claim ID: TP-RCU-UP-00517/2025
        Policy Information: POL-998877-2025
        Supporting Information: Minor bumper claim in 2023.
        Date: 12-05-2025
        Time: 14:30
        Location: near Kosi Kalan flyover, NH-2
        Vehicles: Motorcycle UP-85-AT-9988 and Truck HR-26-Z-1122
        Parties: Ramesh Kumar and Suresh Singh
        Cause: Speeding truck hit bike from behind near flyover.
        PS: Kosi Kalan PS
        District: Mathura, Uttar Pradesh
        """
        self.claim_id = "TP-RCU-UP-00517/2025"
        
    def test_fact_extraction(self):
        """Verifies the fact extraction parses key fields correctly including policy and supporting info."""
        facts, confidence = extract_facts_from_text(self.sample_text, self.claim_id)
        
        self.assertEqual(facts["claim_id"], self.claim_id)
        self.assertEqual(facts["policy_information"], "POL-998877-2025")
        self.assertIn("UP-85-AT-9988", facts["vehicle_numbers"])
        self.assertIn("HR-26-Z-1122", facts["vehicle_numbers"])
        self.assertEqual(facts["police_station"], "Kosi Kalan Police Station")
        self.assertEqual(facts["district_state"], "Mathura, Uttar Pradesh")
        self.assertGreater(confidence["vehicle_numbers"], 0.5)

    def test_query_generation(self):
        """Verifies query expansion generates structured search strings, including Facebook/Instagram queries."""
        facts, _ = extract_facts_from_text(self.sample_text, self.claim_id)
        queries = generate_search_queries(facts)
        
        self.assertGreater(len(queries), 4)
        self.assertTrue(any("UP-85-AT-9988" in q for q in queries))
        self.assertTrue(any("facebook.com" in q for q in queries))
        self.assertTrue(any("instagram.com" in q for q in queries))

    def test_similarity_scoring(self):
        """Verifies semantic cosine similarity logic."""
        text1 = "A speeding truck hit a motorcycle from behind near Kosi Kalan."
        text2 = "A truck collided with a bike near Kosi Kalan flyover."
        text3 = "Unrelated news about politics and cricket scores in Delhi."
        
        sim1 = cosine_similarity(text1, text2)
        sim2 = cosine_similarity(text1, text3)
        
        self.assertGreater(sim1, sim2)

    def test_mismatch_evaluation(self):
        """Verifies mismatch flagging logic on conflicting causes."""
        facts = {
            "claim_id": self.claim_id,
            "accident_date_time": "2025-05-12T14:30:00",
            "loss_location": "near Kosi Kalan, NH-2",
            "vehicle_numbers": ["UP-85-AT-9988", "HR-26-Z-1122"],
            "vehicle_types": ["Motorcycle", "Truck"],
            "parties_involved": ["Ramesh Kumar", "Suresh Singh"],
            "police_station": "Kosi Kalan PS",
            "district_state": "Mathura",
            "FIR_cause_narrative": "Truck hit bike from behind on the NH-2 highway."
        }
        evidences = [{
            "source": "News",
            "title": "Motorcyclist rams into stationary truck in Mathura",
            "url": "https://www.jagran.com/mathura/news.html",
            "snippet": "A bike collided with a stationary truck parked near Kosi Kalan NH-2 road today. The rider Ramesh Kumar died.",
            "score": 0.82
        }]
        
        flagged, explanations = evaluate_mismatch_flags(facts, evidences)
        self.assertIn("cause", flagged)
        self.assertTrue("stationary" in explanations["cause"].lower() or "parked" in explanations["cause"].lower())

    def test_ai_summary_generation(self):
        """Verifies compilation of AI summaries."""
        facts = {
            "claim_id": self.claim_id,
            "policy_information": "POL-12345",
            "accident_date_time": "2025-05-12T14:30:00",
            "loss_location": "near Kosi Kalan, NH-2",
            "vehicle_numbers": ["UP-85-AT-9988"],
            "parties_involved": ["Ramesh Kumar"]
        }
        evidences = [{"source": "News", "title": "Accident near Kosi Kalan", "url": "https://jagran.com", "snippet": "Bike crashed near Mathura flyover.", "score": 0.85}]
        summary = generate_ai_summary(facts, evidences, ["cause"], [])
        
        self.assertIn("Key Observations", summary)
        self.assertIn("POL-12345", summary)
        self.assertIn("Bhaskar", summary)

    def test_excel_export_generation(self):
        """Verifies openpyxl generates an Excel spreadsheet without exceptions."""
        case_data = {
            "claim_id": self.claim_id,
            "policy_information": "POL-998877-2025",
            "supporting_information": "Minor bumper claim.",
            "risk_level": "HIGH REVIEW",
            "overall_score": 0.81,
            "status": "Completed",
            "pushback_status": "Pushed Successfully",
            "created_at": datetime.now(),
            "accident_date_time": "2025-05-12T14:30:00",
            "loss_location": "near Kosi Kalan, NH-2",
            "vehicle_numbers": "UP-85-AT-9988,HR-26-Z-1122",
            "vehicle_types": "Motorcycle,Truck",
            "parties_involved": "Ramesh Kumar,Suresh Singh",
            "injury_or_death": "Fatal head injuries",
            "police_station": "Kosi Kalan PS",
            "district_state": "Mathura, Uttar Pradesh",
            "FIR_cause_narrative": "Truck hit bike from behind.",
            "ai_summary": "### Key Observations\n* Claim ID TP-RCU-UP-00517/2025.",
            "top_mismatches": "cause",
            "mismatch_cause": "FIR says truck hit bike, news says bike hit stationary truck.",
            "evidences": [
                {
                    "source": "News",
                    "title": "Accident in Mathura",
                    "url": "https://www.jagran.com/news.html",
                    "score": 0.82,
                    "why_relevant": "Same name and vehicle.",
                    "publish_date": "2025-05-12"
                }
            ],
            "image_matches": [
                {
                    "image_name": "stock_damage.jpg",
                    "status": "Reused - Stock Photo",
                    "matched_url": "https://www.shutterstock.com/image-photo/damage-100",
                    "why_matched": "Matches stock image visual fingerprint."
                }
            ],
            "audit_logs": [
                {
                    "timestamp": datetime.now(),
                    "action": "Analysis Completed",
                    "details": "Finished scoring."
                }
            ]
        }
        
        excel_stream = generate_evidence_excel(case_data)
        self.assertIsNotNone(excel_stream)
        self.assertGreater(len(excel_stream.getvalue()), 1000)

if __name__ == "__main__":
    unittest.main()
