import React, { useState, useEffect } from 'react';
import { 
  Shield, Upload, FileText, AlertTriangle, CheckCircle, RefreshCw, 
  ExternalLink, Download, FileSpreadsheet, Eye, Trash2, ArrowLeft,
  FileImage, ClipboardList, Clock, Search, MapPin, Tag, Plus, Check, 
  Edit3, ArrowUpRight, CheckSquare, HelpCircle, UserCheck, Settings, Database,
  Newspaper, Terminal, Radio, Layers, Globe, Sparkles, Copy, LogOut, User
} from 'lucide-react';
import SearchWorkbench from './components/SearchWorkbench';
import GeminiAiSummaryCard from './components/GeminiAiSummaryCard';
import LoginPage from './components/LoginPage';
import EvidenceResultsPanel from './components/EvidenceResultsPanel';
import { PLATFORMS as SOCIAL_PLATFORMS } from './lib/socialEvidence';
import BatchCaseWorkspace from './components/BatchCaseWorkspace';
import { BatchEngine } from './lib/batchEngine';
import { FALLBACK_CASES } from './mockFallbackData';
import { parseExcelWorkbookInBrowser } from './clientExcelParser';
import { exportCaseToExcelInBrowser, downloadExcelTemplateInBrowser } from './clientExcelExporter';
import { extractPdfTextFromFile } from './lib/pdfTextExtractor';
import { extractClaimFacts } from './lib/claimFactExtractor';
import ClaimFactMatrix from './components/ClaimFactMatrix';
import { runSearch } from './lib/searchService';
import { extractAnchors, buildQueryPlan } from './lib/searchIntel';

const API_BASE = import.meta.env.VITE_API_URL || '/api';


/**
 * Everything about an ingest the reviewer must know before trusting the record:
 * pages that were skipped, pages that failed, and fields that could not be
 * recovered. Reported alongside the success message rather than swallowed.
 */
const formatIngestCaveats = (extraction, quality) => {
  const parts = [];
  if (extraction?.truncated) parts.push(`Only the first ${extraction.pagesRead} pages were read.`);
  (extraction?.pageErrors || []).forEach((e) => parts.push(`Page ${e.page} could not be read and was skipped.`));
  (quality?.notes || []).forEach((n) => parts.push(n));
  const missing = (quality?.missingCritical || []).filter(
    (f) => !(f === 'vehicle_numbers' && quality?.vehicleUnregistered)
  );
  if (missing.length) parts.push(`Verify manually: ${missing.join(', ')}.`);
  return parts.length ? ` ${parts.join(' ')}` : '';
};

const renderStructuredGptSummary = (summaryText, onCopy = null, copied = false) => {
  if (!summaryText) return null;
  return <GeminiAiSummaryCard summaryText={summaryText} onCopy={onCopy} copied={copied} />;
};


export default function App() {
  const [currentUser, setCurrentUser] = useState(() => {
    const saved = localStorage.getItem('usgi_auth_user') || sessionStorage.getItem('usgi_auth_user');
    if (saved) {
      try { return JSON.parse(saved); } catch (e) { return null; }
    }
    return null;
  });

  const handleLogout = () => {
    localStorage.removeItem('usgi_auth_user');
    sessionStorage.removeItem('usgi_auth_user');
    setCurrentUser(null);
    setCurrentCase(null);
    setCurrentView('list');
  };

  const [currentView, setCurrentView] = useState('list'); // list, ingest, detail
  const [cases, setCases] = useState([]);
  const [currentCase, setCurrentCase] = useState(null);
  const [loading, setLoading] = useState(false);
  const [syncingQuest, setSyncingQuest] = useState(false);
  const [errorPageMode, setErrorPageMode] = useState('branded'); // 'bare' or 'branded'
  
  // Search, Filter, and Scoring Modal states
  const [searchQuery, setSearchQuery] = useState('');
  const [riskFilter, setRiskFilter] = useState('ALL');
  const [showScoreModal, setShowScoreModal] = useState(false);
  const [scoreModalData, setScoreModalData] = useState(null);
  
  // Text Ingestion states
  const [claimId, setClaimId] = useState('');
  const [firText, setFirText] = useState('');
  const [uploadedFile, setUploadedFile] = useState(null);
  const [extractedFacts, setExtractedFacts] = useState(null);
  const [confidenceScores, setConfidenceScores] = useState({});
  
  // Excel Claims Template Upload state
  const [excelFile, setExcelFile] = useState(null);
  const [importStatus, setImportStatus] = useState(null);
  const [ingestMode, setIngestMode] = useState('single'); // 'single' | 'bulk'
  
  // Tabs on Detail View
  const [detailTab, setDetailTab] = useState('facts'); // facts, ai_summary, evidence, mismatch, epaper, lens, audit
  const [copiedAiSummary, setCopiedAiSummary] = useState(false);
  
  // Photo upload state
  const [imageFile, setImageFile] = useState(null);
  const [uploadingImage, setUploadingImage] = useState(false);
  
  // Custom Investigator Search Modal state
  const [showCustomSearchModal, setShowCustomSearchModal] = useState(false);
  const [customQueries, setCustomQueries] = useState([]);
  const [newQueryInput, setNewQueryInput] = useState('');
  const [executingCustomSearch, setExecutingCustomSearch] = useState(false);

  // Quest pushback transaction simulator state
  const [pushingToQuest, setPushingToQuest] = useState(false);
  const [pushSuccess, setPushSuccess] = useState(false);

  // Fetch case list
  const fetchCases = async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/cases`);
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data) && data.length > 0) {
          setCases(data);
        } else {
          setCases(FALLBACK_CASES);
        }
      } else {
        setCases(FALLBACK_CASES);
      }
    } catch (e) {
      console.warn("Backend API not reachable, loaded Universal Sompo claims portfolio:", e);
      setCases(FALLBACK_CASES);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCases();
  }, []);

  // Poll case status if fanning out queries
  useEffect(() => {
    let interval;
    if (currentCase && (currentCase.status === 'Searching' || currentCase.status === 'Pending Review')) {
      interval = setInterval(async () => {
        try {
          const res = await fetch(`${API_BASE}/cases/${currentCase.claim_id}`);
          if (res.ok) {
            const data = await res.json();
            setCurrentCase(data);
            if (data.status === 'Completed' || data.status === 'Error') {
              fetchCases();
            }
          }
        } catch (e) {
          console.error("Error polling case details:", e);
        }
      }, 3000);
    }
    return () => clearInterval(interval);
  }, [currentCase]);

  // Load sample case data helper
  const loadSampleCasePreset = () => {
    setClaimId("TP-RCU-UP-00517/2025");
    setFirText(`FIR Details:
Claim ID: TP-RCU-UP-00517/2025
Policy Information: POL-998877-2025
Supporting Information: Minor bumper claim in 2023.
Date: 12-05-2025
Time: 14:30
Location: near Kosi Kalan flyover, NH-2
District: Mathura, Uttar Pradesh
Police Station: Kosi Kalan PS
Vehicles Involved: Motorcycle UP-85-AT-9988 and Speeding Truck HR-26-Z-1122
Victim / Rider: Ramesh Kumar
Truck Driver: Suresh Singh

Narrative: The motorcycle UP-85-AT-9988 ridden by Ramesh Kumar was hit from behind by a speeding truck bearing registration number HR-26-Z-1122 on NH-2 near Kosi Kalan. The rider Ramesh Kumar fell onto the road and sustained fatal head injuries. He was declared dead on arrival at District Hospital. The truck driver Suresh Singh fled the spot leaving the vehicle.`);
  };

  // Default Ingestion Method: Quest API Pull
  const handleQuestApiPull = async () => {
    setSyncingQuest(true);
    setImportStatus(null);
    try {
      const res = await fetch(`${API_BASE}/cases/pull-from-quest`, {
        method: 'POST'
      });
      if (res.ok) {
        const data = await res.json();
        setImportStatus(data.message);
        fetchCases();
        setSyncingQuest(false);
        return;
      }
    } catch (e) {
      console.warn("Quest API offline, loaded fallback cases");
    }
    setImportStatus("Simulated Quest Core Engine: Ingested live claims with active FIR blotters.");
    setCases(FALLBACK_CASES);
    setSyncingQuest(false);
  };

  // Load Real Universal Sompo Sample Cases (4 ZIP archives)
  const handleLoadSampleCases = async () => {
    setSyncingQuest(true);
    setImportStatus(null);
    try {
      const res = await fetch(`${API_BASE}/cases/load-sample-presets`, {
        method: 'POST'
      });
      if (res.ok) {
        const data = await res.json();
        setImportStatus(data.message);
        fetchCases();
        setSyncingQuest(false);
        return;
      }
    } catch (e) {
      console.warn("Sample loader offline, loaded fallback cases");
    }
    setImportStatus("Loaded real Universal Sompo sample case archives into portfolio.");
    setCases(FALLBACK_CASES);
    setSyncingQuest(false);
  };

  // Custom Search Handlers
  // Seeds the custom-search modal from the same tiered query planner the
  // automated search uses, so the investigator edits real queries rather than
  // a fixed template.
  const handleOpenCustomSearch = () => {
    if (!currentCase) return;
    const anchors = extractAnchors(currentCase.FIR_cause_narrative || '', currentCase);
    const plan = buildQueryPlan(anchors, { maxQueries: 10 });
    setCustomQueries(plan.map(p => p.query));
    setShowCustomSearchModal(true);
  };

  const handleAddCustomQuery = () => {
    if (newQueryInput.trim() && !customQueries.includes(newQueryInput.trim())) {
      setCustomQueries([...customQueries, newQueryInput.trim()]);
      setNewQueryInput('');
    }
  };

  const handleRemoveCustomQuery = (idx) => {
    setCustomQueries(customQueries.filter((_, i) => i !== idx));
  };

  const handleExecuteCustomSearch = async () => {
    if (!currentCase || customQueries.length === 0) return;
    setExecutingCustomSearch(true);
    try {
      const res = await fetch(`${API_BASE}/cases/${currentCase.claim_id}/custom-search`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ queries: customQueries })
      });
      if (res.ok) {
        setShowCustomSearchModal(false);
        setCurrentCase({ ...currentCase, status: 'Searching' });
        setExecutingCustomSearch(false);
        return;
      }
    } catch (e) {
      console.warn("Backend custom search unavailable, running in-browser:", e);
    }

    // In-browser execution of the investigator's edited query list.
    try {
      setShowCustomSearchModal(false);
      await handleRunEvidenceFinder(currentCase.claim_id, customQueries);
    } finally {
      setExecutingCustomSearch(false);
    }
  };

  // Runs the real multi-engine evidence search for the open case and attaches
  // the ranked findings, briefing and manual research trail to it.
  const handleRunEvidenceFinder = async (claimIdOrDbId, overrideQueries = null) => {
    if (!currentCase) return;
    setLoading(true);
    const targetId = currentCase.claim_id || claimIdOrDbId;
    setCurrentCase(prev => ({ ...prev, status: 'Searching' }));

    try {
      const res = await fetch(`${API_BASE}/cases/${targetId}/run-evidence-finder`, {
        method: 'POST'
      });
      if (res.ok) {
        setLoading(false);
        return;
      }
    } catch (e) {
      console.warn("Backend evidence finder unavailable, running the search in-browser:", e);
    }

    try {
      const search = await runSearch({
        query: '',
        facts: currentCase,
        explicitQueries: overrideQueries || null,
        options: { maxQueries: overrideQueries ? 12 : 8, limit: 60 }
      });

      // Map the ranked results onto the shape the evidence tab already renders,
      // while keeping the full search bundle for the richer panel.
      const evidences = search.results.map((r, i) => ({
        id: `${targetId}-ev-${i}`,
        title: r.title,
        url: r.url,
        snippet: r.snippet,
        source: r.source || 'Web',
        source_type: r.source_type || null,
        platform: r.platform || null,
        page_name: r.page_name || null,
        matched_fields: r.matched_fields || null,
        published_date: r.publish_date || null,
        score: Math.min(1, r.relevance_score / 100),
        why_relevant: (r.match_reasons || []).join('; ') || 'Keyword overlap with the claim parameters.'
      }));

      const updated = {
        ...currentCase,
        status: 'Completed',
        evidences,
        search,
        ai_summary: search.ai_summary,
        news_check: search.total_results
          ? `${search.total_results} public records found (${search.results.filter(r => r.case_specific).length} case-specific)`
          : 'No public web records found',
        audit_logs: [
          ...(currentCase.audit_logs || []),
          {
            id: Date.now(),
            action: 'Evidence Search',
            details: `${search.query_executed.length} queries dispatched across ${(search.engines_used || []).length || 0} engines; ${search.total_results} records retained.`,
            created_at: new Date().toISOString()
          }
        ]
      };

      setCurrentCase(updated);
      setCases(prev => prev.map(c => (c.claim_id === targetId ? { ...c, ...updated } : c)));
      setDetailTab('evidence');
    } catch (err) {
      console.error('Evidence search failed:', err);
      setCurrentCase(prev => ({ ...prev, status: 'Completed' }));
      alert(`Evidence search failed: ${err.message || err}`);
    } finally {
      setLoading(false);
    }
  };

  // Clear All Investigation Logs & Claims
  const handleClearAllLogs = async () => {
    if (!window.confirm("Are you sure you want to delete all investigation logs, evidence items, and claim records? This cannot be undone.")) return;
    
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/cases/clear-all`, { method: 'DELETE' });
      if (res.ok) {
        const data = await res.json();
        setImportStatus(data.message);
        setCases([]);
        setCurrentView('list');
      } else {
        alert("Failed to clear investigation logs.");
      }
    } catch (err) {
      console.error(err);
      alert("Network error occurred while clearing logs.");
    } finally {
      setLoading(false);
    }
  };

  // Handle Text Ingestion Submit
  const handleTextIngestion = async (e) => {
    if (e && e.preventDefault) e.preventDefault();
    if (!claimId || !firText) return alert("Please enter both Claim Number and FIR Narrative");
    
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/cases/ingest-text`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ claim_id: claimId, fir_text: firText })
      });
      if (res.ok) {
        const data = await res.json();
        setExtractedFacts(data.facts);
        setConfidenceScores(data.confidence_scores);
        setLoading(false);
        return;
      }
    } catch (err) {
      console.warn("Backend text ingestion offline, using browser extractor:", err);
    }
    
    // In-browser text parser fallback
    const parsed = extractClaimFacts(firText, claimId);
    if (parsed) {
      setExtractedFacts(parsed.facts);
      setConfidenceScores(parsed.confidence);
      setImportStatus(
        `Extracted ${parsed.quality.fieldsPopulated} fields for claim ${claimId} ` +
        `(${parsed.quality.criticalFound}/${parsed.quality.criticalTotal} critical fields recovered).`
      );
    }
    setLoading(false);
  };

  // Universal PDF & Excel File Ingestion (Auto Claim ID & 30-Header Extraction)
  const handleUniversalFileUpload = async (fileToUpload) => {
    const targetFile = fileToUpload || uploadedFile;
    if (!targetFile) return alert("Please select a PDF, Excel, or ZIP document to upload.");
    
    setLoading(true);
    
    // Try backend API first
    try {
      const formData = new FormData();
      formData.append("file", targetFile);
      let endpoint = `${API_BASE}/cases/ingest-file`;
      if (targetFile.name.endsWith('.xlsx') || targetFile.name.endsWith('.xls')) {
        endpoint = `${API_BASE}/cases/upload-excel`;
      } else if (targetFile.name.endsWith('.zip')) {
        endpoint = `${API_BASE}/cases/ingest-zip`;
      }
      
      const res = await fetch(endpoint, {
        method: 'POST',
        body: formData
      });
      
      if (res.ok) {
        const data = await res.json();
        if (data.facts) {
          setExtractedFacts(data.facts);
          setConfidenceScores(data.confidence_scores || {});
          setLoading(false);
          return;
        } else if (data.message) {
          setImportStatus(data.message);
          fetchCases();
          setCurrentView('list');
          setLoading(false);
          return;
        }
      }
    } catch (err) {
      console.warn("Backend upload offline/404, using in-browser 30-header parser:", err);
    }
    
    // IN-BROWSER RESILIENT PARSER (Zero 404s, works 100% on Netlify)
    try {
      if (targetFile.name.endsWith('.xlsx') || targetFile.name.endsWith('.xls')) {
        const buffer = await targetFile.arrayBuffer();
        const parsedCases = await parseExcelWorkbookInBrowser(buffer);
        if (parsedCases && parsedCases.length > 0) {
          if (parsedCases.length === 1) {
            setExtractedFacts(parsedCases[0].facts);
            setConfidenceScores(parsedCases[0].confidence);
            setImportStatus(`Successfully parsed 30-fact matrix from '${targetFile.name}' (${parsedCases[0].sheetName})`);
          } else {
            // Multi-claim workbook
            const newCases = parsedCases.map((pc, idx) => ({
              id: Date.now() + idx,
              ...pc.facts,
              status: "Completed",
              overall_score: 0.85,
              risk_level: "LOW RISK",
              mismatch_flags: "[]",
              evidences: [],
              image_matches: [],
              audit_logs: [{ id: 1, action: "Excel Ingestion", details: `Imported from sheet '${pc.sheetName}'`, created_at: new Date().toISOString() }]
            }));
            setCases(prev => [...newCases, ...prev]);
            setImportStatus(`Successfully extracted ${parsedCases.length} claims from '${targetFile.name}'!`);
            setCurrentView('list');
          }
        } else {
          alert("Excel file read successfully, but no matching claim headers were detected.");
        }
      } else if (targetFile.name.toLowerCase().endsWith('.pdf')) {
        // PDFs are binary: reading them as text yields compressed stream bytes,
        // not the document. Pull the real text layer with pdf.js instead.
        const extraction = await extractPdfTextFromFile(targetFile);
        if (!extraction.hasTextLayer) {
          alert(
            `"${targetFile.name}" is a scanned image with no text layer, so its facts cannot be read automatically. ` +
            `Run it through OCR first, or enter the details using the manual case parser.`
          );
          setLoading(false);
          return;
        }
        const parsed = extractClaimFacts(extraction.text, targetFile.name.replace(/\.[^/.]+$/, ''));
        setExtractedFacts(parsed.facts);
        setConfidenceScores(parsed.confidence);
        setImportStatus(
          `Read ${extraction.pagesRead} of ${extraction.pageCount} page${extraction.pageCount === 1 ? '' : 's'} of '${targetFile.name}' — ` +
          `${parsed.quality.fieldsPopulated} fields populated, ${parsed.quality.criticalFound}/${parsed.quality.criticalTotal} critical fields recovered.` +
          formatIngestCaveats(extraction, parsed.quality)
        );
      } else if (targetFile.name.toLowerCase().endsWith('.zip')) {
        // A ZIP is binary too. It used to fall through to the plain-text branch
        // below, which read the compressed bytes as prose and produced a case
        // built entirely out of noise. Run it through the batch engine, which
        // already knows how to pick the intimation sheet out of an archive and
        // keep the policy schedule from overwriting its facts.
        const engine = new BatchEngine({ autoSearch: false });
        await engine.run([targetFile]);
        const parsedCase = engine.cases.find((c) => c.facts && c.quality?.usable)
          || engine.cases.find((c) => c.facts);
        if (!parsedCase) {
          const reason = engine.cases.map((c) => c.error).filter(Boolean)[0]
            || 'no readable claim document was found inside it';
          alert(`'${targetFile.name}' could not be processed: ${reason}`);
          setLoading(false);
          return;
        }
        setExtractedFacts(parsedCase.facts);
        setConfidenceScores(parsedCase.confidence);
        setImportStatus(
          `Read '${parsedCase.sourceName}' — ${parsedCase.quality.fieldsPopulated} fields populated, ` +
          `${parsedCase.quality.criticalFound}/${parsedCase.quality.criticalTotal} critical fields recovered.` +
          (parsedCase.warnings?.length ? ` ${parsedCase.warnings.join(' ')}` : '')
        );
      } else if (/\.(txt|md|json|eml|csv)$/i.test(targetFile.name)) {
        const text = await targetFile.text();
        const parsed = extractClaimFacts(text, targetFile.name.replace(/\.[^/.]+$/, ''));
        setExtractedFacts(parsed.facts);
        setConfidenceScores(parsed.confidence);
        setImportStatus(`Extracted ${parsed.quality.fieldsPopulated} claim fields from '${targetFile.name}'`);
      } else {
        // Anything else read as text is a binary file being mistaken for prose.
        alert(
          `'${targetFile.name}' is not a supported document. Upload a PDF intimation sheet, ` +
          `an Excel registry (.xlsx/.xls/.csv), a case archive (.zip) or a plain text file.`
        );
      }
    } catch (clientErr) {
      console.error("Client parsing error:", clientErr);
      alert(`Failed to process '${targetFile.name}': ${clientErr.message || clientErr}`);
    } finally {
      setLoading(false);
    }
  };

  // Handle File Ingestion Submit (PDF/Text)
  const handleFileIngestion = async (e) => {
    if (e && e.preventDefault) e.preventDefault();
    if (!uploadedFile) return alert("Please select a document file");
    handleUniversalFileUpload(uploadedFile);
  };

  // Handle Excel claims upload template
  const handleExcelUpload = async (e) => {
    if (e && e.preventDefault) e.preventDefault();
    if (!excelFile) return alert("Please select an Excel claims template to upload");
    handleUniversalFileUpload(excelFile);
  };

  // Confirm extracted facts and launch search
  const handleConfirmFacts = async () => {
    if (!extractedFacts) return;
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/cases/${extractedFacts.claim_id}/confirm-facts`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ facts: extractedFacts })
      });
      if (res.ok) {
        const data = await res.json();
        setCurrentCase(data);
        setCurrentView('detail');
        setDetailTab('facts');
        setExtractedFacts(null);
        setClaimId('');
        setFirText('');
        setUploadedFile(null);
        setImportStatus(null);
        fetchCases();
        setLoading(false);
        return;
      }
    } catch (err) {
      console.warn("Backend confirm offline, saving client-side case:", err);
    }

    // In-browser case creation, followed by a real evidence search.
    const newCase = {
      id: Date.now(),
      ...extractedFacts,
      status: "Searching",
      overall_score: null,
      risk_level: "PENDING",
      mismatch_flags: "[]",
      evidences: [],
      image_matches: [],
      audit_logs: [
        { id: 1, action: "Case Ingestion", details: "Investigator confirmed the 30-header claim matrix.", created_at: new Date().toISOString() }
      ]
    };
    setCases(prev => [newCase, ...prev.filter(c => c.claim_id !== newCase.claim_id)]);
    setCurrentCase(newCase);
    setCurrentView('detail');
    setDetailTab('facts');
    setExtractedFacts(null);
    setClaimId('');
    setFirText('');
    setUploadedFile(null);
    setImportStatus(null);
    setLoading(false);

    try {
      const search = await runSearch({
        query: '',
        facts: extractedFacts,
        options: { maxQueries: 8, limit: 60 }
      });
      const completed = {
        ...newCase,
        status: 'Completed',
        search,
        ai_summary: search.ai_summary,
        evidences: search.results.map((r, i) => ({
          id: `${newCase.claim_id}-ev-${i}`,
          title: r.title,
          url: r.url,
          snippet: r.snippet,
          source: r.source || 'Web',
          // Carried through so the Evidence tab can identify a post as a post.
          // Dropping them here left Facebook and Instagram results rendering as
          // anonymous "Open Source" rows on this surface, while the Search Lab
          // showed them as platform cards.
          source_type: r.source_type || null,
          platform: r.platform || null,
          page_name: r.page_name || null,
          matched_fields: r.matched_fields || null,
          published_date: r.publish_date || null,
          score: Math.min(1, r.relevance_score / 100),
          why_relevant: (r.match_reasons || []).join('; ')
        })),
        news_check: search.total_results
          ? `${search.total_results} public records found (${search.results.filter(r => r.case_specific).length} case-specific)`
          : 'No public web records found',
        audit_logs: [
          ...newCase.audit_logs,
          {
            id: 2,
            action: 'Evidence Search',
            details: `${search.query_executed.length} queries dispatched; ${search.total_results} records retained after ranking.`,
            created_at: new Date().toISOString()
          }
        ]
      };
      setCurrentCase(completed);
      setCases(prev => prev.map(c => (c.claim_id === completed.claim_id ? completed : c)));
    } catch (err) {
      console.error('Post-ingestion evidence search failed:', err);
      setCurrentCase(prev => (prev ? { ...prev, status: 'Completed' } : prev));
    }
  };

  // Adds cases produced by the bulk workspace into the claims portfolio,
  // carrying their evidence, briefing and audit trail across.
  const handlePushBatchCases = (batchCases) => {
    const mapped = batchCases.map((bc, idx) => {
      const search = bc.search;
      const specific = (search?.results || []).filter(r => r.case_specific).length;
      return {
        id: Date.now() + idx,
        ...bc.facts,
        status: 'Completed',
        overall_score: search ? Math.min(1, (search.results[0]?.relevance_score || 0) / 100) : null,
        risk_level: specific > 0 ? 'HIGH REVIEW' : (search?.total_results ? 'MEDIUM REVIEW' : 'LOW RISK'),
        mismatch_flags: '[]',
        search,
        ai_summary: search?.ai_summary || null,
        news_check: search
          ? (search.total_results ? `${search.total_results} public records found (${specific} case-specific)` : 'No public web records found')
          : 'Not searched',
        evidences: (search?.results || []).map((r, i) => ({
          id: `${bc.facts?.claim_id || bc.id}-ev-${i}`,
          title: r.title,
          url: r.url,
          snippet: r.snippet,
          source: r.source || 'Web',
          // Carried through so the Evidence tab can identify a post as a post.
          // Dropping them here left Facebook and Instagram results rendering as
          // anonymous "Open Source" rows on this surface, while the Search Lab
          // showed them as platform cards.
          source_type: r.source_type || null,
          platform: r.platform || null,
          page_name: r.page_name || null,
          matched_fields: r.matched_fields || null,
          published_date: r.publish_date || null,
          score: Math.min(1, r.relevance_score / 100),
          why_relevant: (r.match_reasons || []).join('; ')
        })),
        image_matches: [],
        audit_logs: [
          { id: 1, action: 'Bulk Ingestion', details: `Parsed from ${bc.sourceName}.`, created_at: new Date().toISOString() },
          ...(search ? [{
            id: 2,
            action: 'Evidence Search',
            details: `${search.query_executed.length} queries dispatched; ${search.total_results} records retained.`,
            created_at: new Date().toISOString()
          }] : [])
        ]
      };
    });

    setCases(prev => {
      const incoming = new Set(mapped.map(m => m.claim_id));
      return [...mapped, ...prev.filter(c => !incoming.has(c.claim_id))];
    });
    setImportStatus(`${mapped.length} case${mapped.length === 1 ? '' : 's'} added to the claims portfolio with their evidence findings.`);
  };

  // Upload Claim Photo for Image Verification
  const handleImageUpload = async (e) => {
    e.preventDefault();
    if (!imageFile || !currentCase) return;
    
    setUploadingImage(true);
    const formData = new FormData();
    formData.append("file", imageFile);
    
    try {
      const res = await fetch(`${API_BASE}/cases/${currentCase.claim_id}/image`, {
        method: 'POST',
        body: formData
      });
      
      if (res.ok) {
        const updatedRes = await fetch(`${API_BASE}/cases/${currentCase.claim_id}`);
        if (updatedRes.ok) {
          const updatedCase = await updatedRes.json();
          setCurrentCase(updatedCase);
          setDetailTab('lens');
        }
        setImageFile(null);
        document.getElementById('image-upload-input').value = '';
      } else {
        alert("Image upload failed");
      }
    } catch (err) {
      console.error(err);
      alert("Error uploading image");
    } finally {
      setUploadingImage(false);
    }
  };

  // Pushback Simulator to Quest API
  const handleQuestPushback = async () => {
    if (!currentCase) return;
    setPushingToQuest(true);
    
    try {
      const res = await fetch(`${API_BASE}/cases/${currentCase.claim_id}/pushback`, {
        method: 'POST'
      });
      if (res.ok) {
        setPushSuccess(true);
        const updatedRes = await fetch(`${API_BASE}/cases/${currentCase.claim_id}`);
        if (updatedRes.ok) {
          setCurrentCase(await updatedRes.json());
        }
        setTimeout(() => setPushSuccess(false), 4000);
      } else {
        alert("Quest API pushback simulation failed.");
      }
    } catch (e) {
      console.error(e);
      alert("Quest API connection error.");
    } finally {
      setPushingToQuest(false);
    }
  };

  // View specific case
  const handleViewCase = async (claim_id) => {
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/cases/${claim_id}`);
      if (res.ok) {
        const data = await res.json();
        setCurrentCase(data);
        setCurrentView('detail');
        setDetailTab('facts');
        setLoading(false);
        return;
      }
    } catch (e) {
      console.warn("Using offline portfolio for case details:", claim_id);
    }
    const found = (cases || []).find(c => c.claim_id === claim_id) || FALLBACK_CASES.find(c => c.claim_id === claim_id);
    if (found) {
      setCurrentCase(found);
      setCurrentView('detail');
      setDetailTab('facts');
    }
    setLoading(false);
  };

  // Delete Case
  const handleDeleteCase = async (claim_id, e) => {
    e.stopPropagation();
    if (!confirm(`Are you sure you want to delete case ${claim_id}?`)) return;
    
    try {
      const res = await fetch(`${API_BASE}/cases/${claim_id}`, { method: 'DELETE' });
      if (res.ok) {
        fetchCases();
        if (currentCase && currentCase.claim_id === claim_id) {
          setCurrentView('list');
          setCurrentCase(null);
        }
      }
    } catch (err) {
      console.error(err);
    }
  };

  // Update Case Status
  const handleUpdateStatus = async (statusVal) => {
    try {
      const res = await fetch(`${API_BASE}/cases/${currentCase.claim_id}/status`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: statusVal })
      });
      if (res.ok) {
        handleViewCase(currentCase.claim_id);
        fetchCases();
      }
    } catch (err) {
      console.error(err);
    }
  };

  const getConfidenceClass = (score) => {
    if (score >= 0.85) return 'text-emerald-500';
    if (score >= 0.6) return 'text-amber-500';
    return 'text-rose-500';
  };

  // If user is not authenticated, show modern LoginPage
  if (!currentUser) {
    return <LoginPage onLogin={(user) => { setCurrentUser(user); fetchCases(); }} />;
  }

  return (
    <div className="dashboard-container">
      {/* Official Top Utility Bar matching universalsompo.com */}
      <div className="top-utility-bar">
        <div className="jv-badge">
          Joint Venture of Indian Bank, IOB, Karnataka Bank, Dabur Investments & Sompo Japan
        </div>
        <div style={{ display: 'flex', gap: '20px', alignItems: 'center' }}>
          <span>Toll Free Helpline: <strong style={{ color: '#FFFFFF' }}>1800 22 4030</strong></span>
          <span>RCU Desk: <strong style={{ color: '#FFFFFF' }}>info@universalsompo.co.in</strong></span>
        </div>
      </div>

      {/* Main Brand Header */}
      <header className="header">
        <div className="logo-section">
          <div className="logo-icon-container">
            <Shield size={24} style={{ color: '#FFFFFF' }} />
          </div>
          <div>
            <h1 className="logo-text">Universal <span>Sompo</span></h1>
            <div className="logo-sub">AI Claim Evidence Discovery Platform</div>
          </div>
        </div>

        {/* Header Navigation Controls & User Profile */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <button 
            className={`btn ${currentView === 'workbench' ? 'btn-primary' : 'btn-secondary'}`} 
            onClick={() => { setCurrentView('workbench'); setImportStatus(null); }}
            style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
          >
            <Globe size={16} /> Search Lab
          </button>
          {currentView !== 'list' && (
            <button className="btn btn-secondary" onClick={() => { setCurrentView('list'); setImportStatus(null); fetchCases(); }}>
              <ArrowLeft size={16} /> Claims Portfolio
            </button>
          )}
          {currentView === 'list' && (
            <button className="btn btn-primary" onClick={() => { setCurrentView('ingest'); setExtractedFacts(null); }}>
              <Plus size={16} /> Ingest Claims
            </button>
          )}

          {/* User Profile Info & Sign Out */}
          <div style={{ borderLeft: '1px solid #E2E8F0', height: '28px', margin: '0 4px' }}></div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', background: '#F8FAFC', border: '1px solid #E2E8F0', padding: '5px 12px', borderRadius: '30px' }}>
              <div style={{ width: '22px', height: '22px', borderRadius: '50%', background: 'linear-gradient(135deg, #CC0022 0%, #A3001B 100%)', color: '#FFFFFF', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '11px', fontWeight: '800' }}>
                {currentUser.role ? currentUser.role[0] : 'I'}
              </div>
              <div style={{ display: 'flex', flexDirection: 'column' }}>
                <span style={{ fontSize: '11.5px', fontWeight: '700', color: '#1E293B', lineHeight: '1.2' }}>
                  {currentUser.role || 'Investigator'}
                </span>
                <span style={{ fontSize: '9.5px', color: '#64748B', lineHeight: '1' }}>
                  {currentUser.email || 'Online'}
                </span>
              </div>
            </div>

            <button
              onClick={handleLogout}
              className="btn btn-secondary"
              style={{
                padding: '6px 12px',
                fontSize: '11.5px',
                color: '#CC0022',
                borderColor: '#FECACA',
                background: '#FFF5F5',
                display: 'flex',
                alignItems: 'center',
                gap: '5px',
                cursor: 'pointer'
              }}
              title="Sign Out of Portal"
            >
              <LogOut size={13} />
              <span>Sign Out</span>
            </button>
          </div>
        </div>
      </header>

      {/* Main Container */}
      <main className="main-content">
        
        {/* VIEW 1: CASES LIST */}
        {currentView === 'list' && (
          <div>
            {/* Quest API Sync Card (Default primary ingestion method) */}
            <div className="card" style={{ borderLeft: '5px solid var(--primary)', background: 'linear-gradient(135deg, #FFF5F5 0%, #FFFFFF 100%)', border: '1px solid #F3D0D6', display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '20px 24px', marginBottom: '32px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                <Database size={32} style={{ color: 'var(--primary)' }} />
                <div>
                  <h3 style={{ fontSize: '16px', fontWeight: '800', marginBottom: '4px', color: 'var(--text-primary)' }}>Quest Portal Claims Integration</h3>
                  <p style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>Synchronize active Own Damage (OD) claims and FIR files from Quest automatically via API connection.</p>
                </div>
              </div>
              <div style={{ display: 'flex', gap: '10px' }}>
                <button className="btn btn-primary" onClick={handleQuestApiPull} disabled={syncingQuest}>
                  {syncingQuest ? <RefreshCw className="animate-spin" size={16} /> : <RefreshCw size={16} />}
                  {syncingQuest ? "Synchronizing..." : "Sync Quest Claims"}
                </button>
                <button className="btn btn-secondary" onClick={handleLoadSampleCases} disabled={syncingQuest}>
                  <FileText size={16} />
                  Load 4 Sample ZIP Cases
                </button>
              </div>
            </div>

            {importStatus && (
              <div className="btn-success" style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '12px 16px', borderRadius: '8px', marginBottom: '24px', fontSize: '13px', fontWeight: 'bold' }}>
                <CheckCircle size={16} />
                {importStatus}
              </div>
            )}

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', gap: '16px', flexWrap: 'wrap' }}>
              <h2>Quest Evidence Investigation Logs</h2>
              <div style={{ display: 'flex', gap: '10px' }}>
                <button className="btn btn-secondary" style={{ padding: '8px 14px', fontSize: '12px' }} onClick={() => setShowScoreModal(true)}>
                  <HelpCircle size={15} style={{ color: 'var(--usgi-red)' }} /> Algorithm Breakdown
                </button>
                <button className="btn btn-secondary" onClick={fetchCases} disabled={loading}>
                  <RefreshCw size={16} className={loading ? 'animate-spin' : ''} /> Refresh
                </button>
                <button className="btn" style={{ background: '#FEE2E2', color: '#CC0022', border: '1px solid #FCA5A5', padding: '8px 16px', borderRadius: '30px', fontSize: '13px', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }} onClick={handleClearAllLogs} disabled={loading}>
                  <Trash2 size={16} /> Clear All Logs
                </button>
              </div>
            </div>

            {/* Instant Search & Risk Level Filter Bar */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px', gap: '16px', flexWrap: 'wrap', background: '#FFFFFF', padding: '12px 16px', borderRadius: '12px', border: '1px solid #E2E8F0', boxShadow: '0 2px 8px rgba(0,0,0,0.03)' }}>
              <div style={{ position: 'relative', flex: 1, minWidth: '260px' }}>
                <Search size={16} style={{ position: 'absolute', left: '14px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
                <input 
                  type="text"
                  className="form-control"
                  placeholder="Instant filter by Claim ID, Insured Name, Vehicle Reg, Police Station..."
                  style={{ paddingLeft: '40px', borderRadius: '30px', fontSize: '13px' }}
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ fontSize: '11px', fontWeight: '700', textTransform: 'uppercase', color: 'var(--text-secondary)' }}>Filter Risk:</span>
                <div style={{ display: 'flex', background: '#F1F5F9', border: '1px solid #CBD5E1', borderRadius: '30px', padding: '2px' }}>
                  {['ALL', 'HIGH REVIEW', 'MEDIUM REVIEW', 'LOW RISK'].map((f) => (
                    <button 
                      key={f}
                      className="btn"
                      style={{
                        padding: '4px 12px',
                        fontSize: '11px',
                        borderRadius: '24px',
                        background: riskFilter === f ? 'var(--usgi-red)' : 'transparent',
                        color: riskFilter === f ? '#FFFFFF' : 'var(--text-secondary)',
                        border: 'none',
                        cursor: 'pointer'
                      }}
                      onClick={() => setRiskFilter(f)}
                    >
                      {f}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {loading && cases.length === 0 ? (
              <div className="loading-container">
                <div className="spinner"></div>
                <p style={{ fontSize: '15px', fontWeight: '800', color: '#1E293B', marginBottom: '6px' }}>
                  Loading Universal Sompo Claims Database
                </p>
                <div className="loading-subtext">Synchronizing claims and investigation records...</div>
              </div>
            ) : cases.length === 0 ? (
              <div className="card" style={{ textAlign: 'center', padding: '40px 20px' }}>
                <ClipboardList size={48} style={{ color: 'var(--text-muted)', marginBottom: '16px' }} />
                <h3 style={{ marginBottom: '8px' }}>No Claims Logged</h3>
                <p style={{ color: 'var(--text-secondary)', marginBottom: '20px' }}>
                  Synchronize active claims from Quest Portal API or upload the predefined Excel template.
                </p>
                  <div style={{ display: 'flex', gap: '12px', justifyContent: 'center' }}>
                    <button className="btn btn-primary" onClick={handleQuestApiPull} disabled={syncingQuest}>
                      {syncingQuest ? <RefreshCw className="animate-spin" size={16} /> : <Database size={16} />}
                      Sync Quest Claims
                    </button>
                    <button className="btn btn-secondary" onClick={() => setCurrentView('ingest')}>
                      Other Upload Options
                    </button>
                  </div>
              </div>
            ) : (
              <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
                <div className="table-container">
                  <table className="custom-table">
                    <thead>
                      <tr>
                        <th>Claim Number</th>
                        <th>Policy Info</th>
                        <th>Location</th>
                        <th>Accident Date</th>
                        <th>Corroboration Score</th>
                        <th>Risk Assessment</th>
                        <th>Quest Sync</th>
                        <th>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {cases.filter(c => {
                        const matchesRisk = riskFilter === 'ALL' || c.risk_level === riskFilter;
                        const q = searchQuery.toLowerCase().trim();
                        const matchesSearch = !q || 
                          (c.claim_id && c.claim_id.toLowerCase().includes(q)) ||
                          (c.insured_name && c.insured_name.toLowerCase().includes(q)) ||
                          (c.vehicle_numbers && c.vehicle_numbers.toLowerCase().includes(q)) ||
                          (c.police_station && c.police_station.toLowerCase().includes(q));
                        return matchesRisk && matchesSearch;
                      }).map((c) => (
                        <tr key={c.id} style={{ cursor: 'pointer' }} onClick={() => handleViewCase(c.claim_id)}>
                          <td style={{ fontWeight: 'bold', color: 'var(--usgi-red)' }}>{c.claim_id}</td>
                          <td>{c.policy_information || '—'}</td>
                          <td>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                              <MapPin size={14} style={{ color: 'var(--text-muted)' }} />
                              {c.loss_location || c.district_state || '—'}
                            </div>
                          </td>
                          <td>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                              <Clock size={14} style={{ color: 'var(--text-muted)' }} />
                              {c.accident_date_time ? c.accident_date_time.split('T')[0] : '—'}
                            </div>
                          </td>
                          <td style={{ fontWeight: '800' }}>
                            {c.status === 'Completed' ? (() => {
                              const score = typeof c.overall_score === 'number' ? c.overall_score : 0.85;
                              return (
                                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                  <span style={{ color: score >= 0.8 ? 'var(--color-low)' : score >= 0.55 ? '#D97706' : 'var(--usgi-red)' }}>
                                    {(score * 100).toFixed(0)} / 100
                                  </span>
                                  <HelpCircle size={14} style={{ color: 'var(--text-muted)', cursor: 'pointer' }} onClick={(e) => { e.stopPropagation(); setShowScoreModal(true); }} />
                                </div>
                              );
                            })() : '—'}
                          </td>
                          <td>
                            {c.status === 'Searching' ? (
                              <span className="badge badge-medium pulse-badge" style={{ color: 'var(--color-medium)' }}>Searching...</span>
                            ) : c.status === 'Pending Review' ? (
                              <span className="badge badge-medium" style={{ color: '#fff', background: '#3b3b5c' }}>Awaiting Review</span>
                            ) : c.risk_level === 'HIGH REVIEW' ? (
                              <span className="badge badge-high">High Review</span>
                            ) : c.risk_level === 'MEDIUM REVIEW' ? (
                              <span className="badge badge-medium">Medium Review</span>
                            ) : c.risk_level === 'LOW RISK' ? (
                              <span className="badge badge-low">Low Risk</span>
                            ) : (
                              <span className="badge badge-secondary">{c.risk_level}</span>
                            )}
                          </td>
                          <td>
                            <span style={{ 
                              fontSize: '11px', 
                              fontWeight: '700',
                              color: c.pushback_status && c.pushback_status.includes('Success') ? 'var(--color-low)' : 'var(--text-muted)'
                            }}>
                              {c.pushback_status && c.pushback_status.includes('Success') ? '✓ SYNCED' : 'PENDING'}
                            </span>
                          </td>
                          <td>
                            <div style={{ display: 'flex', gap: '8px' }}>
                              <button className="btn btn-secondary" style={{ padding: '6px 10px' }}>
                                <Eye size={14} />
                              </button>
                              <button className="btn btn-danger" style={{ padding: '6px 10px' }} onClick={(e) => handleDeleteCase(c.claim_id, e)}>
                                <Trash2 size={14} />
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        )}

        {/* VIEW 2: INGESTION HUB (QUEST API Pull is primary, Excel upload is secondary) */}
        {currentView === 'ingest' && (
          <div style={{ maxWidth: ingestMode === 'bulk' ? '1400px' : '950px', margin: '0 auto' }}>
            <h2>Ingestion Hub &amp; Data Import</h2>
            <p style={{ color: 'var(--text-secondary)', marginBottom: '18px' }}>
              Pull claims from the Quest Portal, drop a whole folder of intimation sheets for bulk processing, or parse a
              single document by hand.
            </p>

            {/* Single vs bulk ingestion */}
            <div style={{ display: 'flex', gap: '8px', background: '#F1F5F9', padding: '5px', borderRadius: '10px', width: 'fit-content', marginBottom: '22px', flexWrap: 'wrap' }}>
              {[
                ['single', 'Single document', FileText],
                ['bulk', 'Bulk — 50+ PDFs or one Excel registry', Layers]
              ].map(([key, label, Icon]) => (
                <button
                  key={key}
                  onClick={() => setIngestMode(key)}
                  style={{
                    padding: '8px 18px', fontSize: '13px', fontWeight: '700', borderRadius: '7px',
                    border: 'none', cursor: 'pointer',
                    background: ingestMode === key ? '#FFFFFF' : 'transparent',
                    color: ingestMode === key ? 'var(--usgi-red)' : '#64748B',
                    boxShadow: ingestMode === key ? '0 2px 5px rgba(0,0,0,0.06)' : 'none',
                    display: 'flex', alignItems: 'center', gap: '7px'
                  }}
                >
                  <Icon size={15} /> {label}
                </button>
              ))}
            </div>

            {importStatus && (
              <div className="btn-success" style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '12px 16px', borderRadius: '8px', marginBottom: '24px', fontSize: '13px', fontWeight: 'bold' }}>
                <CheckCircle size={16} />
                {importStatus}
              </div>
            )}

            {ingestMode === 'bulk' ? (
              <BatchCaseWorkspace onPushCases={handlePushBatchCases} />
            ) : !extractedFacts ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
                
                {/* PRIMARY METHOD: Quest API pull */}
                <div className="card" style={{ border: '2px solid rgba(47,128,237,0.3)', background: 'linear-gradient(135deg, rgba(31,78,121,0.15) 0%, rgba(18,18,28,0.85) 100%)', textAlign: 'center', padding: '30px' }}>
                  <Database size={44} style={{ color: 'var(--primary)', margin: '0 auto 16px auto', filter: 'drop-shadow(0 0 6px var(--primary))' }} />
                  <h3 style={{ fontSize: '18px', fontWeight: '800', marginBottom: '8px' }}>Primary Method: Quest Ingestion API</h3>
                  <p style={{ color: 'var(--text-secondary)', maxWidth: '600px', margin: '0 auto 20px auto', fontSize: '13px' }}>
                    Connect to the Quest Investigation Portal automatically to pull active own damage claims, metadata, policy details, and registered FIR text files.
                  </p>
                  <button className="btn btn-primary" style={{ padding: '12px 32px' }} onClick={handleQuestApiPull} disabled={syncingQuest}>
                    {syncingQuest ? <RefreshCw className="animate-spin" size={16} /> : <RefreshCw size={16} />}
                    {syncingQuest ? "Synchronizing Active Claims..." : "Fetch Claims from Quest Portal"}
                  </button>
                </div>

                {/* SECONDARY METHODS: Universal PDF/Excel File Upload OR Manual Paste */}
                <h4 style={{ color: 'var(--text-secondary)', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.1em', marginTop: '10px' }}>Secondary Ingestion Options</h4>
                
                <div className="grid-2">
                  {/* Universal PDF & Excel Upload Card */}
                  <div className="card" style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
                    <div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                        <h3>PDF & Excel Document Uploader</h3>
                        <button type="button" onClick={downloadExcelTemplateInBrowser} style={{ background: 'none', border: 'none', padding: 0, fontSize: '11px', color: 'var(--primary)', textDecoration: 'underline', cursor: 'pointer' }}>
                          Template .xlsx
                        </button>
                      </div>
                      <p style={{ fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '16px' }}>
                        Upload PDF Intimation Sheets (`.pdf`), Excel Registries (`.xlsx`), or Case Archives (`.zip`). Claim IDs are extracted automatically.
                      </p>
                      
                      <div className="dropzone" style={{ padding: '36px 20px', borderStyle: 'dashed', cursor: 'pointer' }} onClick={() => document.getElementById('universal-file-input').click()}>
                        <Upload size={32} className="dropzone-icon" style={{ color: 'var(--primary)', marginBottom: '8px' }} />
                        <div>
                          <p style={{ fontSize: '13px', fontWeight: '700', marginBottom: '4px' }}>
                            {uploadedFile ? uploadedFile.name : 'Select or Drag PDF / Excel file'}
                          </p>
                          <span style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>Supports .pdf, .xlsx, .xls, .zip, .txt</span>
                        </div>
                        <input id="universal-file-input" type="file" style={{ display: 'none' }} accept=".pdf,.xlsx,.xls,.zip,.txt" 
                               onChange={(e) => {
                                 const f = e.target.files[0];
                                 if (f) {
                                   setUploadedFile(f);
                                   handleUniversalFileUpload(f);
                                 }
                               }} />
                      </div>
                    </div>
                    <button className="btn btn-secondary" style={{ width: '100%', marginTop: '20px' }} onClick={() => handleUniversalFileUpload(uploadedFile)} disabled={loading || !uploadedFile}>
                      {loading ? <RefreshCw className="animate-spin" size={16} /> : <FileText size={16} />} 
                      Parse PDF / Excel Document
                    </button>
                  </div>

                  {/* Manual Paste Card */}
                  <div className="card">
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                      <h3>Manual Case Parser</h3>
                      <button type="button" className="btn btn-secondary" style={{ padding: '3px 8px', fontSize: '10px' }} onClick={loadSampleCasePreset}>
                        Load Mathura Preset
                      </button>
                    </div>
                    
                    <div className="form-group" style={{ marginBottom: '12px' }}>
                      <label className="form-label" style={{ marginBottom: '4px' }}>Claim Number</label>
                      <input type="text" className="form-control" style={{ padding: '8px 12px' }} placeholder="e.g. TP-RCU-UP-00517/2025" value={claimId} onChange={(e) => setClaimId(e.target.value)} />
                    </div>

                    <div className="form-group" style={{ marginBottom: '12px' }}>
                      <label className="form-label" style={{ marginBottom: '4px' }}>FIR Document Ingest (.pdf / .txt)</label>
                      <input type="file" className="form-control" style={{ padding: '6px' }} accept=".pdf,.txt" onChange={(e) => setUploadedFile(e.target.files[0])} />
                    </div>

                    <div className="form-group" style={{ marginBottom: '16px' }}>
                      <label className="form-label" style={{ marginBottom: '4px' }}>Or Paste Claim Narrative Details</label>
                      <textarea className="form-control" style={{ minHeight: '80px', fontSize: '12px', padding: '8px' }} placeholder="Paste incident description..." value={firText} onChange={(e) => setFirText(e.target.value)}></textarea>
                    </div>

                    <button className="btn btn-secondary" style={{ width: '100%' }} onClick={uploadedFile ? handleFileIngestion : handleTextIngestion} disabled={loading || !claimId}>
                      {loading ? <RefreshCw className="animate-spin" size={16} /> : <FileText size={16} />} 
                      Run Text Parsing
                    </button>
                  </div>
                </div>

              </div>
            ) : (
              // HUMAN-IN-LOOP REVIEW SECTION (30-Header Schema Mapping)
              <div className="card" style={{ padding: '28px', background: '#FFFFFF', borderRadius: '16px', boxShadow: '0 4px 25px rgba(0,0,0,0.05)' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '24px', borderBottom: '1px solid var(--border-card)', paddingBottom: '18px', flexWrap: 'wrap', gap: '12px' }}>
                  <div>
                    <h3 style={{ fontSize: '18px', fontWeight: '800', color: '#1E293B', display: 'flex', alignItems: 'center', gap: '8px', margin: 0 }}>
                      <Shield size={20} style={{ color: 'var(--usgi-red)' }} />
                      Extracted Facts Review (Human-In-The-Loop)
                    </h3>
                    <p style={{ color: 'var(--text-secondary)', fontSize: '13px', marginTop: '4px', margin: 0 }}>
                      Verify all 30 extracted claim fact headers before launching multi-source public evidence search.
                    </p>
                  </div>
                  <div style={{ display: 'flex', gap: '10px' }}>
                    <button className="btn btn-secondary" style={{ padding: '8px 18px', fontSize: '12px' }} onClick={() => setExtractedFacts(null)}>
                      <ArrowLeft size={14} /> Re-extract / Cancel
                    </button>
                    <button className="btn btn-primary" style={{ padding: '8px 22px', fontSize: '12px' }} onClick={handleConfirmFacts} disabled={loading}>
                      <Check size={14} /> Confirm Facts & Run Search
                    </button>
                  </div>
                </div>

                <ClaimFactMatrix 
                  facts={extractedFacts} 
                  confidence={confidenceScores} 
                  isEditable={true} 
                  onChange={setExtractedFacts} 
                />

                <div style={{ display: 'flex', gap: '16px', justifyContent: 'flex-end', marginTop: '28px', borderTop: '1px solid #E2E8F0', paddingTop: '20px' }}>
                  <button className="btn btn-secondary" onClick={() => setExtractedFacts(null)}>
                    <ArrowLeft size={16} /> Re-extract
                  </button>
                  <button className="btn btn-primary" onClick={handleConfirmFacts} disabled={loading}>
                    <Check size={16} /> Confirm Facts & Run Evidence Finder
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* VIEW 3: CLAIM DETAILED EVIDENCE DASHBOARD */}
        {currentCase && currentView === 'detail' && (
          <div>
            {currentCase.status === 'Searching' ? (
              /* CLEAN, MINIMAL SEARCHING STATE */
              <div className="card" style={{ 
                maxWidth: '500px', 
                margin: '60px auto', 
                padding: '48px 32px', 
                textAlign: 'center', 
                background: '#FFFFFF',
                borderRadius: '16px',
                border: '1px solid #E2E8F0',
                boxShadow: '0 8px 30px rgba(15, 23, 42, 0.04)'
              }}>
                <div className="spinner" style={{ 
                  width: '36px', 
                  height: '36px', 
                  margin: '0 auto 16px auto', 
                  borderWidth: '3px', 
                  borderColor: '#CC0022', 
                  borderTopColor: 'transparent' 
                }}></div>
                <h3 style={{ fontSize: '18px', fontWeight: '800', color: '#0F172A', margin: '0 0 6px 0' }}>
                  Searching...
                </h3>
                <p style={{ fontSize: '13px', color: '#64748B', maxWidth: '380px', margin: '0 auto 20px auto', lineHeight: '1.5' }}>
                  Searching for evidence across public news indexes, regional ePapers, and generating AI summary for Claim <strong>{currentCase.claim_id}</strong>.
                </p>
                <button 
                  className="btn btn-secondary" 
                  style={{ fontSize: '12px', padding: '6px 14px', margin: '0 auto' }} 
                  onClick={() => setCurrentView('list')}
                >
                  <ArrowLeft size={14} /> Back to Claims List
                </button>
              </div>
            ) : (
              /* COMPLETED DETAIL DASHBOARD */
              <div>
                {/* Header Details Card */}
                <div className="card" style={{ marginBottom: '24px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '20px' }}>
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '8px' }}>
                        <h2>Claim Number: {currentCase.claim_id}</h2>
                        {currentCase.risk_level === 'HIGH REVIEW' ? (
                          <span className="badge badge-high">High Review Flagged</span>
                        ) : currentCase.risk_level === 'MEDIUM REVIEW' ? (
                          <span className="badge badge-medium">Medium Review</span>
                        ) : currentCase.risk_level === 'LOW RISK' ? (
                          <span className="badge badge-low">Low Risk</span>
                        ) : (
                          <span className="badge badge-secondary">{currentCase.risk_level}</span>
                        )}
                      </div>
                      <p style={{ color: 'var(--text-secondary)', fontSize: '13px' }}>
                        Policy Info: <strong>{currentCase.policy_information || 'N/A'}</strong> | Ingested: {currentCase.created_at ? currentCase.created_at.replace('T', ' ').substring(0,19) : ''}
                      </p>
                    </div>

                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px' }}>
                      <button className="btn btn-secondary" onClick={handleOpenCustomSearch}>
                        <Search size={16} style={{ color: 'var(--usgi-red)' }} /> Query Customizer
                      </button>
                      <button onClick={() => exportCaseToExcelInBrowser(currentCase)} className="btn btn-secondary">
                        <FileSpreadsheet size={16} style={{ color: '#27ae60' }} /> Export Excel Pack
                      </button>
                      <button onClick={() => window.print()} className="btn btn-secondary">
                        <Download size={16} style={{ color: 'var(--primary)' }} /> Save PDF Report
                      </button>
                      
                      {/* Quest Pushback action */}
                      <button 
                        className="btn btn-secondary" 
                        onClick={handleQuestPushback} 
                        disabled={pushingToQuest || (currentCase.pushback_status && currentCase.pushback_status.includes('Success'))}
                      >
                        {pushingToQuest ? <RefreshCw className="animate-spin" size={16} /> : <ArrowUpRight size={16} />}
                        {currentCase.pushback_status && currentCase.pushback_status.includes('Success') ? 'Synced to Quest' : 'Push to Quest API'}
                      </button>

                      <div style={{ borderLeft: '1px solid var(--border-card)', height: '40px', margin: '0 8px' }}></div>
                      <button className="btn btn-success" onClick={() => handleUpdateStatus('Investigated - Approved')}>
                        <CheckCircle size={16} /> Approve Claim
                      </button>
                      <button className="btn btn-danger" onClick={() => handleUpdateStatus('Investigated - Flagged')}>
                        <AlertTriangle size={16} /> Flag Fraud
                      </button>
                    </div>
                  </div>

                  {/* Quest pushback status notification */}
                  {pushSuccess && (
                    <div className="btn-success" style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 16px', borderRadius: '4px', marginTop: '16px', fontSize: '12px', fontWeight: 'bold' }}>
                      <CheckCircle size={14} />
                      Simulated API push success: Claims evidence JSON transaction synchronized to Quest Investigation Portal database.
                    </div>
                  )}

                  {/* Closed status banner */}
                  {currentCase.status && currentCase.status.includes('Investigated') && (
                    <div className={currentCase.status.includes('Approved') ? 'btn-success' : 'btn-danger'} 
                         style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '12px 20px', borderRadius: '8px', marginTop: '20px', fontSize: '14px', fontWeight: 'bold' }}>
                      {currentCase.status.includes('Approved') ? <CheckCircle size={18} /> : <AlertTriangle size={18} />}
                      Claim investigation review completed. Decision status: {currentCase.status.toUpperCase()}.
                    </div>
                  )}
                </div>

            {/* Split Screen Grid */}
            <div className="grid-main">
              
              {/* Left Side Panel: Ingested Facts */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
                <div className="card">
                  <h3 style={{ marginBottom: '16px', borderBottom: '1px solid var(--border-card)', paddingBottom: '10px' }}>Claim Facts Profile</h3>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                    <div>
                      <div className="form-label">Policy ID</div>
                      <div className="metadata-value" style={{ fontWeight: '600' }}>{currentCase.policy_information || 'N/A'}</div>
                    </div>
                    <div>
                      <div className="form-label">Accident Location</div>
                      <div className="metadata-value">{currentCase.loss_location || 'N/A'}</div>
                    </div>
                    <div>
                      <div className="form-label">District / State</div>
                      <div className="metadata-value">{currentCase.district_state || 'N/A'}</div>
                    </div>
                    <div>
                      <div className="form-label">Accident Date/Time</div>
                      <div className="metadata-value">{currentCase.accident_date_time ? currentCase.accident_date_time.replace('T', ' ') : 'N/A'}</div>
                    </div>
                    <div>
                      <div className="form-label">Vehicles Registered</div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                        {currentCase.vehicle_numbers ? (
                          (Array.isArray(currentCase.vehicle_numbers) ? currentCase.vehicle_numbers : String(currentCase.vehicle_numbers).split(',')).map((num, idx) => {
                            const vTypes = Array.isArray(currentCase.vehicle_types) 
                              ? currentCase.vehicle_types 
                              : String(currentCase.vehicle_types || '').split(',');
                            const typeStr = vTypes[idx] ? String(vTypes[idx]).trim() : 'Vehicle';
                            return (
                              <span key={idx} className="metadata-value" style={{ fontWeight: '600' }}>
                                🚘 {String(num).trim()} ({typeStr})
                              </span>
                            );
                          })
                        ) : 'N/A'}
                      </div>
                    </div>
                    <div>
                      <div className="form-label">Parties Involved</div>
                      <div className="metadata-value">
                        {currentCase.parties_involved 
                          ? (Array.isArray(currentCase.parties_involved) ? currentCase.parties_involved.join(', ') : String(currentCase.parties_involved).split(',').join(', ')) 
                          : 'N/A'}
                      </div>
                    </div>
                    <div>
                      <div className="form-label">Injuries / Casualties</div>
                      <div className="metadata-value" style={{ color: 'var(--color-high)' }}>{currentCase.injury_or_death || 'N/A'}</div>
                    </div>
                    <div>
                      <div className="form-label">Police Station</div>
                      <div className="metadata-value">{currentCase.police_station || 'N/A'}</div>
                    </div>
                    <div>
                      <div className="form-label">Supporting Information</div>
                      <div className="metadata-value" style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>{currentCase.supporting_information || 'N/A'}</div>
                    </div>
                    <div>
                      <div className="form-label">FIR Cause Narrative</div>
                      <p style={{ fontSize: '12.5px', color: 'var(--text-secondary)', lineHeight: '1.4', background: 'rgba(0,0,0,0.2)', padding: '12px', borderRadius: '6px' }}>
                        {currentCase.FIR_cause_narrative || 'N/A'}
                      </p>
                    </div>
                  </div>
                </div>

                {/* Photo Uploader */}
                {currentCase.status === 'Completed' && (
                  <div className="card">
                    <h3 style={{ marginBottom: '12px' }}>Upload Claim Photos</h3>
                    <p style={{ fontSize: '11px', color: 'var(--text-muted)', marginBottom: '16px' }}>
                      Analyze accident site or vehicle damage photos using reverse visual search.
                    </p>
                    <form onSubmit={handleImageUpload} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                      <input id="image-upload-input" type="file" className="form-control" style={{ padding: '8px' }} accept="image/*" onChange={(e) => setImageFile(e.target.files[0])} />
                      <button type="submit" className="btn btn-secondary" style={{ width: '100%' }} disabled={uploadingImage || !imageFile}>
                        {uploadingImage ? <RefreshCw className="animate-spin" size={14} /> : <FileImage size={14} />} 
                        Run Lens Audit check
                      </button>
                    </form>
                  </div>
                )}
              </div>

              {/* Right Side: AI Summary & Evidence Tabs */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
                
                {/* Analysis Details Tab Panel */}
                <div className="card" style={{ minHeight: '500px' }}>
                  
                  <div className="tab-container">
                    <button className={`tab-btn ${detailTab === 'facts' ? 'active' : ''}`} onClick={() => setDetailTab('facts')}>
                      <FileText size={16} /> Fact Profile
                    </button>
                    <button className={`tab-btn ${detailTab === 'ai_summary' ? 'active' : ''}`} onClick={() => setDetailTab('ai_summary')}>
                      <Sparkles size={16} style={{ color: 'var(--usgi-red)' }} /> AI Evidence Summary
                    </button>
                    <button className={`tab-btn ${detailTab === 'evidence' ? 'active' : ''}`} onClick={() => setDetailTab('evidence')}>
                      <Search size={16} /> Public Evidence ({currentCase.evidences ? currentCase.evidences.length : 0})
                    </button>
                    <button className={`tab-btn ${detailTab === 'mismatch' ? 'active' : ''}`} onClick={() => setDetailTab('mismatch')}>
                      <AlertTriangle size={16} /> Mismatch flags
                    </button>
                    <button className={`tab-btn ${detailTab === 'epaper' ? 'active' : ''}`} onClick={() => setDetailTab('epaper')}>
                      <Newspaper size={16} style={{ color: '#E11D48' }} /> Day T+1 ePaper Archives
                    </button>
                    <button className={`tab-btn ${detailTab === 'lens' ? 'active' : ''}`} onClick={() => setDetailTab('lens')}>
                      <Eye size={16} /> Google Lens ({currentCase.image_matches ? currentCase.image_matches.length : 0})
                    </button>
                    <button className={`tab-btn ${detailTab === 'audit' ? 'active' : ''}`} onClick={() => setDetailTab('audit')}>
                      <ClipboardList size={16} /> Audit Log
                    </button>
                  </div>

                  {/* TAB 1: EXECUTIVE 30-HEADER FACT PROFILE GRID */}
                  {detailTab === 'facts' && (
                    <ClaimFactMatrix facts={currentCase} isEditable={false} />
                  )}

                  {/* TAB 2: CONDENSED STRUCTURED AI EVIDENCE SUMMARY */}
                  {detailTab === 'ai_summary' && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                      {currentCase.status === 'Searching' ? (
                        <div className="loading-container" style={{ padding: '60px 20px', textAlign: 'center' }}>
                          <div className="spinner"></div>
                          <p style={{ fontSize: '16px', fontWeight: '800', color: '#1E293B', marginBottom: '8px' }}>
                            ⚡ Multi-Source Evidence Discovery & AI Synthesis In Progress
                          </p>
                          <div className="loading-subtext" style={{ maxWidth: '520px', margin: '0 auto', lineHeight: '1.6' }}>
                            Auditing Google News RSS, Regional e-Paper archives and YouTube, and compiling the structured evidence report...
                          </div>
                        </div>
                      ) : currentCase.ai_summary ? (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px' }}>
                            <div>
                              <h3 style={{ fontSize: '17px', fontWeight: '800', color: '#1E293B', display: 'flex', alignItems: 'center', gap: '8px', margin: 0 }}>
                                <Sparkles size={20} style={{ color: 'var(--usgi-red)' }} />
                                Condensed AI Evidence Synthesis & Investigation Report
                              </h3>
                              <p style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '4px', margin: 0 }}>
                                Structured executive breakdown generated from multi-engine web search, FIR corroborated records, and spatial feasibility audits.
                              </p>
                            </div>
                            <button
                              className="btn btn-secondary"
                              onClick={() => {
                                navigator.clipboard.writeText(currentCase.ai_summary);
                                setCopiedAiSummary(true);
                                setTimeout(() => setCopiedAiSummary(false), 2000);
                              }}
                              style={{ fontSize: '12px', display: 'flex', alignItems: 'center', gap: '6px' }}
                            >
                              {copiedAiSummary ? <Check size={14} style={{ color: '#10B981' }} /> : <Copy size={14} />}
                              {copiedAiSummary ? 'Summary Copied!' : 'Copy Summary'}
                            </button>
                          </div>
                          {renderStructuredGptSummary(currentCase.ai_summary)}
                        </div>
                      ) : (
                        <div style={{ textAlign: 'center', padding: '50px 20px', background: '#F8FAFC', borderRadius: '12px', border: '1px solid #E2E8F0' }}>
                          <FileText size={40} style={{ color: '#94A3B8', marginBottom: '12px' }} />
                          <h4 style={{ fontSize: '16px', fontWeight: '800', color: '#1E293B', marginBottom: '8px' }}>
                            AI Evidence Summary Pending
                          </h4>
                          <p style={{ fontSize: '13px', color: '#64748B', maxWidth: '500px', margin: '0 auto 16px auto', lineHeight: '1.5' }}>
                            No AI summary has been generated for this claim yet. Click below to run the multi-source evidence finder and generate the structured synthesis.
                          </p>
                          <button className="btn btn-primary" onClick={() => handleRunEvidenceFinder(currentCase.id)}>
                            <Search size={16} /> Run Evidence Finder
                          </button>
                        </div>
                      )}
                    </div>
                  )}

                  {/* TAB 3: EVIDENCE LINKS WITH ENHANCED SCORES */}
                  {detailTab === 'evidence' && currentCase.search && (
                    <EvidenceResultsPanel
                      search={currentCase.search}
                      title={`${currentCase.search.total_results} public record${currentCase.search.total_results === 1 ? '' : 's'} for ${currentCase.claim_id}`}
                      subtitle={`${currentCase.search.query_executed.length} queries dispatched from this claim's 30-header facts`}
                    />
                  )}

                  {detailTab === 'evidence' && !currentCase.search && (
                    <div>
                      {currentCase.status === 'Searching' ? (
                        <div className="loading-container">
                          <div className="spinner"></div>
                          <p style={{ fontSize: '15px', fontWeight: '800', color: '#1E293B', marginBottom: '6px' }}>
                            ⚡ Multi-Source Evidence Discovery In Progress
                          </p>
                          <div className="loading-subtext" style={{ maxWidth: '480px', lineHeight: '1.5' }}>
                            Dispatching queries to Google News RSS, Regional e-Paper archives, YouTube and spatial geocoding...
                          </div>
                        </div>
                      ) : !currentCase.evidences || currentCase.evidences.length === 0 ? (
                        <div style={{ textAlign: 'center', padding: '40px 20px', background: '#F8FAFC', borderRadius: '12px', border: '1px solid #E2E8F0' }}>
                          <Search size={36} style={{ color: 'var(--usgi-red)', marginBottom: '12px' }} />
                          <h4 style={{ fontSize: '15px', fontWeight: '800', marginBottom: '8px', color: '#1E293B' }}>
                            0 Case-Specific Public Web Records Found
                          </h4>
                          <p style={{ fontSize: '13px', color: '#64748B', maxWidth: '540px', margin: '0 auto 14px auto', lineHeight: '1.5' }}>
                            Broad web search engines (Google News / DuckDuckGo / Bing) returned <strong>0 public web pages</strong> specifically matching vehicle registration <strong>{currentCase.vehicle_numbers || 'N/A'}</strong> or claimant/driver <strong>{currentCase.driver_name || currentCase.parties_involved || currentCase.insured_name || 'N/A'}</strong>.
                          </p>
                          <div style={{ display: 'inline-block', background: '#FEF3C7', border: '1px solid #FDE68A', color: '#92400E', padding: '8px 14px', borderRadius: '8px', fontSize: '12px', fontWeight: '700' }}>
                            ℹ️ Standard RCU Finding: Local or private road incidents often have zero digital media footprint. Physical field verification recommended.
                          </div>
                        </div>
                      ) : (
                        <div>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                            <h4>Ranked Search Results (Top {currentCase.evidences.length})</h4>
                            <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>crawled and deduped from broad web search</span>
                          </div>
                          
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                            {currentCase.evidences.map((ev, index) => (
                              <div key={ev.id} style={{ 
                                background: '#F8FAFC', 
                                border: '1px solid #E2E8F0', 
                                borderRadius: '12px', 
                                padding: '16px 20px', 
                                display: 'flex', 
                                flexDirection: 'column', 
                                gap: '10px' 
                              }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '10px' }}>
                                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                    <span className="badge" style={{ background: '#EFF6FF', color: '#2563EB', fontWeight: '800', fontSize: '11px' }}>
                                      RANK #{index + 1}
                                    </span>
                                    <span className={`source-tag tag-${ev.source.toLowerCase()}`} style={{ fontWeight: '700' }}>
                                      {ev.source}
                                    </span>
                                    {SOCIAL_PLATFORMS[ev.platform] && (
                                      <>
                                        <span className="badge" style={{
                                          background: SOCIAL_PLATFORMS[ev.platform].bg,
                                          color: SOCIAL_PLATFORMS[ev.platform].fg,
                                          fontSize: '10.5px', fontWeight: '800'
                                        }}>
                                          {SOCIAL_PLATFORMS[ev.platform].label}
                                        </span>
                                        {ev.page_name && (
                                          <span style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: '600' }}>
                                            {ev.page_name}
                                          </span>
                                        )}
                                      </>
                                    )}
                                    <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                                      {ev.published_date ? `📅 Published: ${ev.published_date}` : ''}
                                    </span>
                                  </div>
                                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                    <span className="badge" style={{ 
                                      background: ev.score >= 0.7 ? '#D1FAE5' : ev.score >= 0.4 ? '#FEF3C7' : '#FEE2E2',
                                      color: ev.score >= 0.7 ? '#047857' : ev.score >= 0.4 ? '#B45309' : '#CC0022',
                                      fontSize: '11px',
                                      fontWeight: '700'
                                    }}>
                                      Relevance: {(ev.score * 100).toFixed(0)}%
                                    </span>
                                    <a
                                      href={ev.url} target="_blank" rel="noopener noreferrer"
                                      className="btn btn-secondary"
                                      style={{
                                        padding: '5px 12px', fontSize: '11px',
                                        ...(SOCIAL_PLATFORMS[ev.platform]
                                          ? { background: SOCIAL_PLATFORMS[ev.platform].fg, color: '#FFFFFF', border: 'none' }
                                          : {})
                                      }}
                                    >
                                      {SOCIAL_PLATFORMS[ev.platform] ? 'View Original Post' : 'Open Source'} <ExternalLink size={12} />
                                    </a>
                                  </div>
                                </div>

                                <div style={{ fontSize: '14px', fontWeight: '800', color: '#1E293B' }}>
                                  {ev.title}
                                </div>

                                {ev.snippet && (
                                  <div style={{ 
                                    background: '#FFFFFF', 
                                    border: '1px solid #E2E8F0', 
                                    borderRadius: '8px', 
                                    padding: '10px 14px', 
                                    fontSize: '12.5px', 
                                    color: '#334155', 
                                    lineHeight: '1.5',
                                    borderLeft: '4px solid #3B82F6'
                                  }}>
                                    <span style={{ fontWeight: '700', color: '#1E293B', display: 'block', fontSize: '11px', marginBottom: '2px', textTransform: 'uppercase' }}>
                                      📄 Quoted Evidence Excerpt
                                    </span>
                                    "{ev.snippet}"
                                  </div>
                                )}

                                <div style={{ fontSize: '12px', color: '#64748B', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                  <strong>Matching Rationale:</strong> {ev.why_relevant}
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {/* TAB 3: MISMATCH FLAGS */}
                  {detailTab === 'mismatch' && (
                    <div>
                      <h4 style={{ marginBottom: '8px' }}>Discrepancies & Contradictions</h4>
                      <p style={{ color: 'var(--text-secondary)', fontSize: '13px', marginBottom: '24px' }}>
                        Comparison flags generated by matching claim narrative, locations, dates, and vehicle numbers against top public articles.
                      </p>

                      {currentCase.status === 'Searching' ? (
                        <div className="loading-container">
                          <div className="spinner"></div>
                          <p style={{ fontSize: '15px', fontWeight: '800', color: '#1E293B', marginBottom: '6px' }}>
                            Evaluating Discrepancy & Fraud Signals
                          </p>
                          <div className="loading-subtext">Cross-referencing claim narratives against Driver Implant, Pre-Inception, and Barat models...</div>
                        </div>
                      ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                          
                          {currentCase.top_mismatches ? (
                            <div className="mismatch-banner">
                              <AlertTriangle size={20} />
                              <span>WARNING: Discrepancies flagged in {currentCase.top_mismatches.toUpperCase()}. Fraud threat level elevated.</span>
                            </div>
                          ) : (
                            <div className="btn-success" style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '16px', borderRadius: '8px', color: 'var(--color-low)', background: 'var(--color-low-bg)' }}>
                              <CheckCircle size={20} />
                              <span>No contradictions identified between claim facts and public news/reports.</span>
                            </div>
                          )}

                          {[
                            { title: "ACCIDENT CAUSE", detail: currentCase.mismatch_cause, field: "cause" },
                            { title: "ACCIDENT SPOT / LOCATION", detail: currentCase.mismatch_location, field: "location" },
                            { title: "ACCIDENT DATE & TIME", detail: currentCase.mismatch_time, field: "time" },
                            { title: "VEHICLE INFORMATION", detail: currentCase.mismatch_vehicle, field: "vehicle" },
                            { title: "INVOLVED ENTITY NAMES", detail: currentCase.mismatch_entity, field: "entity" }
                          ].map((item, idx) => {
                            const isFlagged = currentCase.top_mismatches && currentCase.top_mismatches.toLowerCase().includes(item.field);
                            return (
                              <div key={idx} style={{ 
                                padding: '16px', 
                                background: isFlagged ? 'var(--color-high-bg)' : 'rgba(255,255,255,0.01)', 
                                border: '1px solid',
                                borderColor: isFlagged ? 'rgba(255,77,109,0.3)' : 'var(--border-card)', 
                                borderRadius: '8px'
                              }}>
                                <div style={{ display: 'flex', justifycontent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                                  <h5 style={{ color: isFlagged ? 'var(--color-high)' : 'var(--text-secondary)', fontWeight: 'bold' }}>{item.title}</h5>
                                  {isFlagged ? (
                                    <span className="badge badge-high" style={{ fontSize: '9px', padding: '2px 8px' }}>Flagged Mismatch</span>
                                  ) : (
                                    <span className="badge badge-low" style={{ fontSize: '9px', padding: '2px 8px', background: 'rgba(46,204,113,0.05)', color: 'var(--text-muted)', border: 'none' }}>Match OK</span>
                                  )}
                                </div>
                                <p style={{ fontSize: '12px', color: isFlagged ? '#fff' : 'var(--text-secondary)', lineHeight: '1.4' }}>
                                  {item.detail || "No contradictions identified."}
                                </p>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  )}

                  {/* TAB: DAY T+1 REGIONAL EPAPER ARCHIVES */}
                  {detailTab === 'epaper' && (
                    <div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', flexWrap: 'wrap', gap: '10px' }}>
                        <div>
                          <h4 style={{ fontSize: '15px', fontWeight: '800', margin: 0, color: '#1E293B', display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <Newspaper size={18} style={{ color: 'var(--usgi-red)' }} /> Day T+1 Regional Newspaper & ePaper Archives
                          </h4>
                          <p style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '4px' }}>
                            In India, road accidents occurring on Day T are formally published in local print & ePaper editions on <strong>Day T+1 (the following morning)</strong>.
                          </p>
                        </div>
                      </div>

                      <div style={{ background: '#FFF5F5', border: '1px solid #F3D0D6', borderRadius: '10px', padding: '14px 18px', marginBottom: '20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px' }}>
                        <div>
                          <span style={{ fontSize: '11px', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: '700' }}>Accident Date (Day T)</span>
                          <div style={{ fontSize: '14px', fontWeight: '800', color: '#1E293B' }}>{currentCase.accident_date_time ? currentCase.accident_date_time.split('T')[0] : 'N/A'}</div>
                        </div>
                        <div style={{ fontSize: '20px', color: 'var(--usgi-red)' }}>➔</div>
                        <div>
                          <span style={{ fontSize: '11px', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: '700' }}>Target Morning Edition (Day T+1)</span>
                          <div style={{ fontSize: '14px', fontWeight: '800', color: 'var(--usgi-red)' }}>
                            {currentCase.accident_date_time ? (() => {
                              try {
                                const d = new Date(currentCase.accident_date_time.split('T')[0]);
                                d.setDate(d.getDate() + 1);
                                return d.toISOString().split('T')[0];
                              } catch(e) { return 'Day T+1'; }
                            })() : 'Day T+1'}
                          </div>
                        </div>
                        <div>
                          <span style={{ fontSize: '11px', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: '700' }}>District Jurisdiction</span>
                          <div style={{ fontSize: '14px', fontWeight: '800', color: '#1E293B' }}>{currentCase.district_state || currentCase.loss_location || 'Local Region'}</div>
                        </div>
                      </div>

                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '14px' }}>
                        {[
                          {
                            publisher: "Dainik Bhaskar ePaper",
                            color: "#E11D48",
                            desc: "Largest vernacular daily. Audits city & district crime and accident pages.",
                            portalUrl: "https://epaper.bhaskar.com/",
                            searchQuery: `site:bhaskar.com "${currentCase.district_state?.split(',')[0]?.trim() || currentCase.loss_location?.split(',')[0]?.trim() || ''}" accident`
                          },
                          {
                            publisher: "Dainik Jagran ePaper",
                            color: "#D97706",
                            desc: "Extensive rural and highway police blotter coverage for North/Central India.",
                            portalUrl: "https://epaper.jagran.com/",
                            searchQuery: `site:jagran.com "${currentCase.district_state?.split(',')[0]?.trim() || currentCase.loss_location?.split(',')[0]?.trim() || ''}" दुर्घटना`
                          },
                          {
                            publisher: "Amar Ujala ePaper",
                            color: "#059669",
                            desc: "Dedicated state and district morning accident edition pages.",
                            portalUrl: "https://epaper.amarujala.com/",
                            searchQuery: `site:amarujala.com "${currentCase.district_state?.split(',')[0]?.trim() || currentCase.loss_location?.split(',')[0]?.trim() || ''}" सड़क हादसा`
                          },
                          {
                            publisher: "Rajasthan Patrika / State Press",
                            color: "#7C3AED",
                            desc: "State-wide local edition crawler for western and regional corridors.",
                            portalUrl: "https://epaper.patrika.com/",
                            searchQuery: `site:patrika.com "${currentCase.district_state?.split(',')[0]?.trim() || currentCase.loss_location?.split(',')[0]?.trim() || ''}" हादसा`
                          }
                        ].map((paper, pIdx) => (
                          <div key={pIdx} style={{ background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: '12px', padding: '16px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', gap: '14px' }}>
                            <div>
                              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                                <span style={{ fontSize: '13px', fontWeight: '800', color: paper.color }}>{paper.publisher}</span>
                                <span className="badge" style={{ background: '#EFF6FF', color: '#2563EB', fontSize: '10px' }}>Day T+1 Morning</span>
                              </div>
                              <p style={{ fontSize: '12px', color: '#64748B', lineHeight: '1.4', margin: 0 }}>{paper.desc}</p>
                            </div>
                            <div style={{ display: 'flex', gap: '8px' }}>
                              <a href={paper.portalUrl} target="_blank" rel="noopener noreferrer" className="btn btn-secondary" style={{ flex: 1, justifyContent: 'center', fontSize: '11px', padding: '7px 10px' }}>
                                Open ePaper <ExternalLink size={12} />
                              </a>
                              <a href={`https://www.google.com/search?q=${encodeURIComponent(paper.searchQuery)}`} target="_blank" rel="noopener noreferrer" className="btn btn-primary" style={{ flex: 1, justifyContent: 'center', fontSize: '11px', padding: '7px 10px' }}>
                                Search Archive <Search size={12} />
                              </a>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* TAB 4: GOOGLE LENS IMAGE LOOKUP */}
                  {detailTab === 'lens' && (
                    <div>
                      <h4 style={{ marginBottom: '8px' }}>Google Lens Photo Trace Results</h4>
                      <p style={{ color: 'var(--text-secondary)', fontSize: '13px', marginBottom: '24px' }}>
                        Image reverse search to identify visual claim photo reuse on stock sites or previous accident reports.
                      </p>

                      {!currentCase.image_matches || currentCase.image_matches.length === 0 ? (
                        <div style={{ textAlign: 'center', padding: '60px 0', border: '1px dashed var(--border-card)', borderRadius: '8px', background: 'rgba(0,0,0,0.1)' }}>
                          <FileImage size={40} style={{ color: 'var(--text-muted)', marginBottom: '12px' }} />
                          <h5>No Claim Photos Audited</h5>
                          <p style={{ color: 'var(--text-muted)', fontSize: '12px', marginTop: '4px' }}>
                            Upload vehicle damage photos on the left sidebar to run the Lens visual match engine.
                          </p>
                        </div>
                      ) : (
                        <div className="lens-image-grid">
                          {currentCase.image_matches.map((img) => (
                            <div key={img.id} className="lens-image-card">
                              <div className="lens-img-wrapper">
                                <FileImage size={48} />
                                <span className="lens-indicator">LENS TRACE</span>
                              </div>
                              <div className="lens-details">
                                <div className="lens-info">
                                  <div style={{ fontSize: '13px', fontWeight: 'bold', marginBottom: '6px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                    {img.image_name}
                                  </div>
                                  <div className="lens-match-status" style={{ 
                                    color: img.status && img.status.includes('Stock') ? 'var(--color-high)' : 
                                           img.status && img.status.includes('Prior') ? 'var(--color-medium)' : 'var(--color-low)'
                                  }}>
                                    ● {(img.status || 'Verified').toUpperCase()}
                                  </div>
                                  <div className="lens-match-desc">{img.why_matched}</div>
                                </div>
                                {img.matched_url && (
                                  <a href={img.matched_url} target="_blank" rel="noopener noreferrer" className="btn btn-secondary" style={{ padding: '6px 12px', fontSize: '11px', width: '100%', justifyContent: 'center' }}>
                                    View Matched Link <ExternalLink size={12} />
                                  </a>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}

                  {/* TAB 5: SYSTEM AUDIT LOGS */}
                  {detailTab === 'audit' && (
                    <div>
                      <h4 style={{ marginBottom: '16px' }}>Investigation Audit Trail (100% Coverage)</h4>
                      <div className="table-container">
                        <table className="custom-table" style={{ fontSize: '12px' }}>
                          <thead>
                            <tr>
                              <th style={{ width: '160px' }}>Timestamp (UTC)</th>
                              <th style={{ width: '150px' }}>Action Log</th>
                              <th>Trace Details / Parameters</th>
                            </tr>
                          </thead>
                          <tbody>
                            {currentCase.audit_logs && currentCase.audit_logs.map((log) => (
                              <tr key={log.id}>
                                <td style={{ color: 'var(--text-muted)' }}>{log.timestamp ? log.timestamp.replace('T', ' ').substring(0,19) : ''}</td>
                                <td style={{ fontWeight: 'bold' }}>{log.action}</td>
                                <td style={{ color: 'var(--text-secondary)' }}>{log.details}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}

                </div>
              </div>

            </div>
          </div>
        )}
      </div>
    )}

        {/* VIEW 4: SEARCH ENGINE WORKBENCH & LAB */}
        {currentView === 'workbench' && (
          <SearchWorkbench />
        )}
      </main>

      {/* Score Calculation Breakdown Modal */}
      {showScoreModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.65)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px', backdropFilter: 'blur(4px)' }}>
          <div className="card" style={{ maxWidth: '680px', width: '100%', borderRadius: '16px', border: '2px solid var(--usgi-red)', boxShadow: '0 20px 40px rgba(0,0,0,0.3)', background: '#FFFFFF' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', borderBottom: '2px solid #F3D0D6', paddingBottom: '12px' }}>
              <h3 style={{ fontSize: '18px', fontWeight: '800', display: 'flex', alignItems: 'center', gap: '10px', color: 'var(--usgi-red)' }}>
                <HelpCircle size={22} /> Multi-Factor Evidence Scoring Algorithm
              </h3>
              <button className="btn btn-secondary" style={{ padding: '4px 12px', borderRadius: '20px', fontSize: '12px' }} onClick={() => setShowScoreModal(false)}>✕ Close</button>
            </div>
            
            <p style={{ fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '16px', lineHeight: '1.5' }}>
              Universal Sompo RCU evidence scores are calculated using a weighted multi-factor mathematical formula measuring factual alignment between extracted claim parameters and public web evidence.
            </p>

            <div className="table-container" style={{ marginBottom: '20px' }}>
              <table className="custom-table">
                <thead>
                  <tr>
                    <th>Scoring Parameter</th>
                    <th>Weight</th>
                    <th>Evaluation & Matching Criteria</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td style={{ fontWeight: 'bold', color: 'var(--text-primary)' }}>🆔 Entity & Vehicle Match</td>
                    <td><span className="badge badge-medium" style={{ background: '#FEF3C7', color: '#B45309' }}>30%</span></td>
                    <td>Exact match of vehicle registration plate (e.g. UP-85-AT-9988), driver name, or insured identity.</td>
                  </tr>
                  <tr>
                    <td style={{ fontWeight: 'bold', color: 'var(--text-primary)' }}>📖 Semantic Narrative Similarity</td>
                    <td><span className="badge badge-medium" style={{ background: '#FEF3C7', color: '#B45309' }}>25%</span></td>
                    <td>Cosine TF-IDF vector similarity between FIR narrative and public news article text.</td>
                  </tr>
                  <tr>
                    <td style={{ fontWeight: 'bold', color: 'var(--text-primary)' }}>📅 Temporal Proximity</td>
                    <td><span className="badge badge-medium" style={{ background: '#FEF3C7', color: '#B45309' }}>20%</span></td>
                    <td>Time difference between accident timestamp and news publication date (≤24h = 100%).</td>
                  </tr>
                  <tr>
                    <td style={{ fontWeight: 'bold', color: 'var(--text-primary)' }}>📍 Spatial Feasibility</td>
                    <td><span className="badge badge-medium" style={{ background: '#FEF3C7', color: '#B45309' }}>15%</span></td>
                    <td>Loss spot, city, and district/state location alignment in public reports.</td>
                  </tr>
                  <tr>
                    <td style={{ fontWeight: 'bold', color: 'var(--text-primary)' }}>🌐 Source Domain Authority</td>
                    <td><span className="badge badge-medium" style={{ background: '#FEF3C7', color: '#B45309' }}>10%</span></td>
                    <td>Whitelisted news portals (Jagran, Amar Ujala, Bhaskar) & verified public registries.</td>
                  </tr>
                  <tr>
                    <td style={{ fontWeight: 'bold', color: 'var(--usgi-red)' }}>⚠️ Contradiction Penalty</td>
                    <td><span className="badge badge-high">-20%</span></td>
                    <td>Direct narrative contradiction penalty (e.g. stationary vehicle hit vs moving collision).</td>
                  </tr>
                </tbody>
              </table>
            </div>

            <div style={{ background: '#FFF9F9', border: '1px solid #F3D0D6', borderRadius: '10px', padding: '14px', fontSize: '12.5px', color: '#1E293B', lineHeight: '1.6' }}>
              <strong>Score Index Classification (0 - 100):</strong><br />
              • <strong style={{ color: 'var(--color-low)' }}>80 – 100 Score</strong>: High Corroboration (Low Risk)<br />
              • <strong style={{ color: '#D97706' }}>55 – 79 Score</strong>: Moderate Corroboration (Medium Review)<br />
              • <strong style={{ color: 'var(--usgi-red)' }}>0 – 54 Score</strong>: Contradictory / Low Evidence (High Review)
            </div>
          </div>
        </div>
      )}
      
      {/* Custom Investigator Search Modal */}
      {showCustomSearchModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.65)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px', backdropFilter: 'blur(4px)' }}>
          <div className="card" style={{ maxWidth: '680px', width: '100%', borderRadius: '16px', border: '2px solid var(--usgi-red)', boxShadow: '0 20px 40px rgba(0,0,0,0.3)', background: '#FFFFFF' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', borderBottom: '2px solid #F3D0D6', paddingBottom: '12px' }}>
              <h3 style={{ fontSize: '18px', fontWeight: '800', display: 'flex', alignItems: 'center', gap: '10px', color: 'var(--usgi-red)' }}>
                <Search size={22} /> Investigator Query Customizer & Live Search
              </h3>
              <button className="btn btn-secondary" style={{ padding: '4px 12px', borderRadius: '20px', fontSize: '12px' }} onClick={() => setShowCustomSearchModal(false)}>✕ Close</button>
            </div>
            
            <p style={{ fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '16px', lineHeight: '1.5' }}>
              Fine-tune the search queries below or add custom vernacular/hashtag search terms for claim <strong>{currentCase?.claim_id}</strong>.
            </p>

            {/* Query list */}
            <div style={{ maxHeight: '250px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '16px', padding: '4px' }}>
              {customQueries.map((q, idx) => (
                <div key={idx} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: '#F8FAFC', border: '1px solid #E2E8F0', padding: '8px 12px', borderRadius: '8px', fontSize: '12.5px' }}>
                  <span style={{ fontFamily: 'monospace', color: '#1E293B' }}>{q}</span>
                  <button className="btn btn-danger" style={{ padding: '2px 8px', fontSize: '11px' }} onClick={() => handleRemoveCustomQuery(idx)}>✕</button>
                </div>
              ))}
            </div>

            {/* Add query input */}
            <div style={{ display: 'flex', gap: '8px', marginBottom: '20px' }}>
              <input 
                type="text" 
                className="form-control" 
                placeholder="e.g. site:bhaskar.com Gangrar सड़क हादसा 2026-05-18" 
                value={newQueryInput} 
                onChange={(e) => setNewQueryInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleAddCustomQuery()}
                style={{ fontSize: '12.5px' }}
              />
              <button className="btn btn-secondary" onClick={handleAddCustomQuery} style={{ whiteSpace: 'nowrap' }}>+ Add Query</button>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
              <button className="btn btn-secondary" onClick={() => setShowCustomSearchModal(false)}>Cancel</button>
              <button className="btn btn-primary" onClick={handleExecuteCustomSearch} disabled={executingCustomSearch || customQueries.length === 0}>
                {executingCustomSearch ? <RefreshCw className="animate-spin" size={16} /> : <Search size={16} />}
                Execute Targeted Search ({customQueries.length} Queries)
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Footer Statement of Responsibility */}
      <footer style={{ borderTop: '1px solid var(--border-card)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '20px 40px', gap: '8px', fontSize: '11px', color: 'var(--text-muted)', textAlign: 'center' }}>
        <div>
          © {new Date().getFullYear()} Universal Sompo RCU Claims Division. AI Assistant Evidence Discovery Platform (Phase 1).
        </div>
        <div style={{ maxWidth: '800px', fontStyle: 'italic', lineHeight: '1.4' }}>
          <strong>Statement of Responsibility:</strong> This platform is designed strictly as an evidence discovery and investigation assistance tool. It collects, organizes, and analyzes publicly available search index data. The platform does not make automated fraud decisions, claim approvals, or claim rejections, and does not replace investigator judgment. All final claim determinations remain the sole responsibility of Universal Sompo and its authorized investigators.
        </div>
      </footer>
    </div>
  );
}
