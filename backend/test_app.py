import os
import io
import unittest
import openpyxl
from fastapi.testclient import TestClient
from backend.main import app
import backend.extractor as extractor

class TestUniversalSompoTeraBotIntegration(unittest.TestCase):
    def setUp(self):
        self.client = TestClient(app)

    def test_01_intimation_parser(self):
        sample_zip = os.path.join("samples", "CL26148443.zip")
        self.assertTrue(os.path.exists(sample_zip), "samples/CL26148443.zip must exist")
        
        facts, conf = extractor.extract_facts_from_zip(sample_zip)
        self.assertEqual(facts.get("claim_id"), "CL26148443")
        self.assertEqual(facts.get("insured_name"), "Manju")
        self.assertEqual(facts.get("vehicle_make"), "MARUTI")
        self.assertIn("RJ-45-CQ-1390", facts.get("vehicle_numbers"))
        self.assertEqual(facts.get("accident_location_city"), "MUMBAI")

    def test_02_load_sample_presets_endpoint(self):
        res = self.client.post("/api/cases/load-sample-presets")
        self.assertEqual(res.status_code, 200)
        data = res.json()
        self.assertTrue(data.get("success"))
        self.assertGreaterEqual(len(data.get("claims", [])), 4)

    def test_03_list_cases(self):
        res = self.client.get("/api/cases")
        self.assertEqual(res.status_code, 200)
        cases = res.json()
        self.assertGreaterEqual(len(cases), 4)
        
        # Check 30-header properties exist on returned case
        c = cases[0]
        self.assertIn("claim_id", c)
        self.assertIn("insured_name", c)
        self.assertIn("vehicle_make", c)
        self.assertIn("news_check", c)
        self.assertIn("social_media_check", c)

    def test_04_export_excel_terabot_tab(self):
        # Fetch one case ID
        res = self.client.get("/api/cases")
        cases = res.json()
        claim_id = cases[0]["claim_id"]
        
        export_res = self.client.get(f"/api/cases/{claim_id}/export-excel")
        self.assertEqual(export_res.status_code, 200)
        
        # Parse Excel stream
        wb = openpyxl.load_workbook(filename=io.BytesIO(export_res.content))
        self.assertIn("Tera Bot 30 Headers", wb.sheetnames)
        
        ws = wb["Tera Bot 30 Headers"]
        # Verify 30 header columns in Row 4
        headers = [ws.cell(row=4, column=c).value for c in range(1, 31)]
        self.assertEqual(len(headers), 30)
        self.assertEqual(headers[0], "Claim No ")
        self.assertEqual(headers[1], "Insured Name")
        self.assertEqual(headers[4], "Vehicle No")

    def test_05_upload_excel_terabot_file(self):
        excel_path = os.path.join("samples", "Headers - Tera Bot.xlsx")
        self.assertTrue(os.path.exists(excel_path), f"{excel_path} must exist")
        
        with open(excel_path, "rb") as f:
            res = self.client.post("/api/cases/upload-excel", files={"file": ("Headers - Tera Bot.xlsx", f, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")})
        self.assertEqual(res.status_code, 200)
        data = res.json()
        self.assertTrue(data.get("success"))
        self.assertGreaterEqual(len(data.get("claims", [])), 20)

if __name__ == "__main__":
    unittest.main()
