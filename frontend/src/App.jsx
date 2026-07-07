import React, { useState, useEffect } from 'react';
import { 
  Shield, Upload, FileText, AlertTriangle, CheckCircle, RefreshCw, 
  ExternalLink, Download, FileSpreadsheet, Eye, Trash2, ArrowLeft,
  FileImage, ClipboardList, Clock, Search, MapPin, Tag, Plus, Check, 
  Edit3, ArrowUpRight, CheckSquare, HelpCircle, UserCheck, Settings, Database
} from 'lucide-react';

const API_BASE = import.meta.env.VITE_API_URL || '/api';

export default function App() {
  const [currentView, setCurrentView] = useState('list'); // list, ingest, detail
  const [cases, setCases] = useState([]);
  const [currentCase, setCurrentCase] = useState(null);
  const [loading, setLoading] = useState(false);
  const [syncingQuest, setSyncingQuest] = useState(false);
  
  // Role selector state
  const [activeRole, setActiveRole] = useState('Investigator'); // Investigator, RCU Team
  
  // Text Ingestion states
  const [claimId, setClaimId] = useState('');
  const [firText, setFirText] = useState('');
  const [uploadedFile, setUploadedFile] = useState(null);
  const [extractedFacts, setExtractedFacts] = useState(null);
  const [confidenceScores, setConfidenceScores] = useState({});
  
  // Excel Claims Template Upload state
  const [excelFile, setExcelFile] = useState(null);
  const [importStatus, setImportStatus] = useState(null);
  
  // Tabs on Detail View
  const [detailTab, setDetailTab] = useState('facts'); // facts, evidence, mismatch, lens, audit
  
  // Photo upload state
  const [imageFile, setImageFile] = useState(null);
  const [uploadingImage, setUploadingImage] = useState(false);
  
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
        setCases(data);
      }
    } catch (e) {
      console.error("Error fetching cases:", e);
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
      } else {
        alert("Failed to connect to Quest API");
      }
    } catch (e) {
      console.error(e);
      alert("Quest API connection failed. Verify server status.");
    } finally {
      setSyncingQuest(false);
    }
  };

  // Handle Text Ingestion Submit
  const handleTextIngestion = async (e) => {
    e.preventDefault();
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
      } else {
        const err = await res.json();
        alert(err.detail || "Ingestion failed");
      }
    } catch (err) {
      console.error(err);
      alert("Network error occurred during text ingestion.");
    } finally {
      setLoading(false);
    }
  };

  // Handle File Ingestion Submit (PDF/Text)
  const handleFileIngestion = async (e) => {
    e.preventDefault();
    if (!claimId || !uploadedFile) return alert("Please enter Claim Number and select an FIR file");
    
    setLoading(true);
    const formData = new FormData();
    formData.append("file", uploadedFile);
    
    try {
      const res = await fetch(`${API_BASE}/cases/ingest-file?claim_id=${encodeURIComponent(claimId)}`, {
        method: 'POST',
        body: formData
      });
      if (res.ok) {
        const data = await res.json();
        setExtractedFacts(data.facts);
        setConfidenceScores(data.confidence_scores);
      } else {
        const err = await res.json();
        alert(err.detail || "File upload ingestion failed");
      }
    } catch (err) {
      console.error(err);
      alert("Network error occurred during file ingestion.");
    } finally {
      setLoading(false);
    }
  };

  // Handle Excel claims upload template
  const handleExcelUpload = async (e) => {
    e.preventDefault();
    if (!excelFile) return alert("Please select an Excel claims template to upload");
    
    setLoading(true);
    const formData = new FormData();
    formData.append("file", excelFile);
    
    try {
      const res = await fetch(`${API_BASE}/cases/upload-excel`, {
        method: 'POST',
        body: formData
      });
      if (res.ok) {
        const data = await res.json();
        setImportStatus(data.message);
        setExcelFile(null);
        document.getElementById('excel-file-input').value = '';
        fetchCases();
      } else {
        const err = await res.json();
        alert(err.detail || "Excel upload failed");
      }
    } catch (err) {
      console.error(err);
      alert("Error uploading claims template.");
    } finally {
      setLoading(false);
    }
  };

  // Confirm extracted facts and launch search
  const handleConfirmFacts = async () => {
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
        setDetailTab('evidence');
        setExtractedFacts(null);
        setClaimId('');
        setFirText('');
        setUploadedFile(null);
        setImportStatus(null);
        fetchCases();
      } else {
        alert("Failed to confirm facts.");
      }
    } catch (err) {
      console.error(err);
      alert("Error confirming facts.");
    } finally {
      setLoading(false);
    }
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
      } else {
        alert("Could not load case details.");
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
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

  return (
    <div className="dashboard-container">
      {/* Top Role Indicator Bar */}
      <div className="role-banner">
        <UserCheck size={14} />
        <span>Universal Sompo RCU Security Layer: Active Role — {activeRole}</span>
      </div>

      {/* Header */}
      <header className="header">
        <div className="logo-section">
          <Shield size={28} className="text-primary" style={{ color: 'var(--primary)', filter: 'drop-shadow(0 0 8px var(--primary))' }} />
          <div>
            <h1 className="logo-text">Universal Sompo</h1>
            <div className="logo-sub">AI Claim Evidence Finder</div>
          </div>
        </div>

        {/* Role Toggle & Navigation */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
          <div className="role-badge-toggle">
            <button 
              className={`role-toggle-btn ${activeRole === 'Investigator' ? 'active' : ''}`}
              onClick={() => setActiveRole('Investigator')}
            >
              Investigator
            </button>
            <button 
              className={`role-toggle-btn ${activeRole === 'RCU Team' ? 'active' : ''}`}
              onClick={() => setActiveRole('RCU Team')}
            >
              RCU Team
            </button>
          </div>

          <div style={{ display: 'flex', gap: '10px' }}>
            {currentView !== 'list' && (
              <button className="btn btn-secondary" onClick={() => { setCurrentView('list'); setImportStatus(null); fetchCases(); }}>
                <ArrowLeft size={16} /> Back to Claims
              </button>
            )}
            {currentView === 'list' && activeRole === 'Investigator' && (
              <button className="btn btn-primary" onClick={() => { setCurrentView('ingest'); setExtractedFacts(null); }}>
                <Plus size={16} /> Ingest Claims
              </button>
            )}
          </div>
        </div>
      </header>

      {/* Main Container */}
      <main className="main-content">
        
        {/* VIEW 1: CASES LIST */}
        {currentView === 'list' && (
          <div>
            {/* Quest API Sync Card (Default primary ingestion method) */}
            {activeRole === 'Investigator' && (
              <div className="card" style={{ borderLeft: '4px solid var(--primary)', background: 'linear-gradient(135deg, rgba(31,78,121,0.08) 0%, rgba(18,18,28,0.7) 100%)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '20px 24px', marginBottom: '32px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                  <Database size={32} style={{ color: 'var(--primary)', filter: 'drop-shadow(0 0 4px var(--primary))' }} />
                  <div>
                    <h3 style={{ fontSize: '16px', fontWeight: '800', marginBottom: '4px' }}>Quest Portal Claims Integration</h3>
                    <p style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>Synchronize active Own Damage (OD) claims and FIR files from Quest automatically via API connection.</p>
                  </div>
                </div>
                <button className="btn btn-primary" onClick={handleQuestApiPull} disabled={syncingQuest}>
                  {syncingQuest ? <RefreshCw className="animate-spin" size={16} /> : <RefreshCw size={16} />}
                  {syncingQuest ? "Synchronizing..." : "Sync Quest Claims"}
                </button>
              </div>
            )}

            {importStatus && (
              <div className="btn-success" style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '12px 16px', borderRadius: '8px', marginBottom: '24px', fontSize: '13px', fontWeight: 'bold' }}>
                <CheckCircle size={16} />
                {importStatus}
              </div>
            )}

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
              <h2>Quest Evidence Investigation Logs</h2>
              <button className="btn btn-secondary" onClick={fetchCases} disabled={loading}>
                <RefreshCw size={16} className={loading ? 'animate-spin' : ''} /> Refresh
              </button>
            </div>

            {loading && cases.length === 0 ? (
              <div className="loading-container">
                <div className="spinner"></div>
                <p>Retrieving Quest claims database...</p>
              </div>
            ) : cases.length === 0 ? (
              <div className="card" style={{ textAlign: 'center', padding: '40px 20px' }}>
                <ClipboardList size={48} style={{ color: 'var(--text-muted)', marginBottom: '16px' }} />
                <h3 style={{ marginBottom: '8px' }}>No Claims Logged</h3>
                <p style={{ color: 'var(--text-secondary)', marginBottom: '20px' }}>
                  Synchronize active claims from Quest Portal API or upload the predefined Excel template.
                </p>
                {activeRole === 'Investigator' && (
                  <div style={{ display: 'flex', gap: '12px', justifyContent: 'center' }}>
                    <button className="btn btn-primary" onClick={handleQuestApiPull} disabled={syncingQuest}>
                      {syncingQuest ? <RefreshCw className="animate-spin" size={16} /> : <Database size={16} />}
                      Sync Quest Claims
                    </button>
                    <button className="btn btn-secondary" onClick={() => setCurrentView('ingest')}>
                      Other Upload Options
                    </button>
                  </div>
                )}
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
                        <th>Evidence Score</th>
                        <th>Risk Assessment</th>
                        <th>Quest Sync</th>
                        <th>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {cases.map((c) => (
                        <tr key={c.id} style={{ cursor: 'pointer' }} onClick={() => handleViewCase(c.claim_id)}>
                          <td style={{ fontWeight: 'bold' }}>{c.claim_id}</td>
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
                          <td style={{ fontWeight: 'bold' }}>
                            {c.status === 'Completed' ? `${c.overall_score.toFixed(2)}` : '—'}
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
                              color: c.pushback_status.includes('Success') ? 'var(--color-low)' : 'var(--text-muted)'
                            }}>
                              {c.pushback_status.includes('Success') ? '✓ SYNCED' : 'PENDING'}
                            </span>
                          </td>
                          <td>
                            <div style={{ display: 'flex', gap: '8px' }}>
                              <button className="btn btn-secondary" style={{ padding: '6px 10px' }}>
                                <Eye size={14} />
                              </button>
                              {activeRole === 'Investigator' && (
                                <button className="btn btn-danger" style={{ padding: '6px 10px' }} onClick={(e) => handleDeleteCase(c.claim_id, e)}>
                                  <Trash2 size={14} />
                                </button>
                              )}
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
          <div style={{ maxWidth: '950px', margin: '0 auto' }}>
            <h2>Ingestion Hub & Data Import</h2>
            <p style={{ color: 'var(--text-secondary)', marginBottom: '24px' }}>
              Import claim files directly from the Quest Portal, upload the Predefined Excel Template for batch processing, or type manual facts.
            </p>

            {importStatus && (
              <div className="btn-success" style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '12px 16px', borderRadius: '8px', marginBottom: '24px', fontSize: '13px', fontWeight: 'bold' }}>
                <CheckCircle size={16} />
                {importStatus}
              </div>
            )}

            {!extractedFacts ? (
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

                {/* SECONDARY METHODS: Excel template uploader OR manual paste */}
                <h4 style={{ color: 'var(--text-secondary)', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.1em', marginTop: '10px' }}>Secondary Ingestion Options</h4>
                
                <div className="grid-2">
                  {/* Excel Upload Card */}
                  <div className="card" style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
                    <div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                        <h3>Excel Template Upload</h3>
                        <a href={`${API_BASE}/templates/excel`} style={{ fontSize: '11px', color: 'var(--primary)', textDecoration: 'underline' }}>
                          Download Template
                        </a>
                      </div>
                      <p style={{ fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '16px' }}>Upload batch claims using the predefined Universal Sompo Excel sheet format.</p>
                      
                      <div className="dropzone" style={{ padding: '40px 20px' }} onClick={() => document.getElementById('excel-file-input').click()}>
                        <Upload size={30} className="dropzone-icon" />
                        <div>
                          <p style={{ fontSize: '13px', fontWeight: '600' }}>
                            {excelFile ? excelFile.name : 'Select Claims template (.xlsx)'}
                          </p>
                        </div>
                        <input id="excel-file-input" type="file" style={{ display: 'none' }} accept=".xlsx" onChange={(e) => setExcelFile(e.target.files[0])} />
                      </div>
                    </div>
                    <button className="btn btn-secondary" style={{ width: '100%', marginTop: '24px' }} onClick={handleExcelUpload} disabled={loading || !excelFile}>
                      {loading ? <RefreshCw className="animate-spin" size={16} /> : <FileSpreadsheet size={16} />} 
                      Ingest Excel Template
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
              // HUMAN-IN-LOOP REVIEW SECTION (Quest schema mapping)
              <div className="card">
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '20px', borderBottom: '1px solid var(--border-card)', paddingBottom: '16px' }}>
                  <div>
                    <h3>Quest Ingestion Verification (Human-In-The-Loop)</h3>
                    <p style={{ color: 'var(--text-secondary)', fontSize: '13px' }}>
                      Review and correct claim facts before triggering public evidence search.
                    </p>
                  </div>
                  <span className="badge badge-low" style={{ background: 'rgba(31,78,121,0.2)', color: 'var(--primary)' }}>Verification Gate</span>
                </div>

                <div style={{ marginBottom: '24px' }}>
                  <div className="fact-row" style={{ fontWeight: 'bold', background: 'rgba(255,255,255,0.02)', fontSize: '11px', textTransform: 'uppercase', color: 'var(--text-secondary)' }}>
                    <div>Claims Schema Field</div>
                    <div>Extracted Value (Editable)</div>
                    <div>Confidence</div>
                  </div>

                  <div className="fact-row">
                    <div className="metadata-label">Claim Number</div>
                    <input type="text" className="form-control" value={extractedFacts.claim_id} onChange={(e) => setExtractedFacts({...extractedFacts, claim_id: e.target.value})} />
                    <div className="confidence-indicator text-emerald-500">100%</div>
                  </div>

                  <div className="fact-row">
                    <div className="metadata-label">Policy Information</div>
                    <input type="text" className="form-control" value={extractedFacts.policy_information || ''} onChange={(e) => setExtractedFacts({...extractedFacts, policy_information: e.target.value})} />
                    <div className={`confidence-indicator ${getConfidenceClass(confidenceScores.policy_information)}`}>
                      {confidenceScores.policy_information ? `${Math.round(confidenceScores.policy_information * 100)}%` : '—'}
                    </div>
                  </div>

                  <div className="fact-row">
                    <div className="metadata-label">Accident Date/Time</div>
                    <input type="text" className="form-control" value={extractedFacts.accident_date_time || ''} onChange={(e) => setExtractedFacts({...extractedFacts, accident_date_time: e.target.value})} />
                    <div className={`confidence-indicator ${getConfidenceClass(confidenceScores.accident_date_time)}`}>
                      {confidenceScores.accident_date_time ? `${Math.round(confidenceScores.accident_date_time * 100)}%` : '—'}
                    </div>
                  </div>

                  <div className="fact-row">
                    <div className="metadata-label">Accident Location Spot</div>
                    <input type="text" className="form-control" value={extractedFacts.loss_location || ''} onChange={(e) => setExtractedFacts({...extractedFacts, loss_location: e.target.value})} />
                    <div className={`confidence-indicator ${getConfidenceClass(confidenceScores.loss_location)}`}>
                      {confidenceScores.loss_location ? `${Math.round(confidenceScores.loss_location * 100)}%` : '—'}
                    </div>
                  </div>

                  <div className="fact-row">
                    <div className="metadata-label">Vehicle Registration Numbers</div>
                    <input type="text" className="form-control" value={extractedFacts.vehicle_numbers.join(', ')} 
                           onChange={(e) => setExtractedFacts({...extractedFacts, vehicle_numbers: e.target.value.split(',').map(s => s.trim())})} />
                    <div className={`confidence-indicator ${getConfidenceClass(confidenceScores.vehicle_numbers)}`}>
                      {confidenceScores.vehicle_numbers ? `${Math.round(confidenceScores.vehicle_numbers * 100)}%` : '—'}
                    </div>
                  </div>

                  <div className="fact-row">
                    <div className="metadata-label">Vehicle Types</div>
                    <input type="text" className="form-control" value={extractedFacts.vehicle_types.join(', ')} 
                           onChange={(e) => setExtractedFacts({...extractedFacts, vehicle_types: e.target.value.split(',').map(s => s.trim())})} />
                    <div className={`confidence-indicator ${getConfidenceClass(confidenceScores.vehicle_types)}`}>
                      {confidenceScores.vehicle_types ? `${Math.round(confidenceScores.vehicle_types * 100)}%` : '—'}
                    </div>
                  </div>

                  <div className="fact-row">
                    <div className="metadata-label">Involved Parties</div>
                    <input type="text" className="form-control" value={extractedFacts.parties_involved.join(', ')} 
                           onChange={(e) => setExtractedFacts({...extractedFacts, parties_involved: e.target.value.split(',').map(s => s.trim())})} />
                    <div className={`confidence-indicator ${getConfidenceClass(confidenceScores.parties_involved)}`}>
                      {confidenceScores.parties_involved ? `${Math.round(confidenceScores.parties_involved * 100)}%` : '—'}
                    </div>
                  </div>

                  <div className="fact-row">
                    <div className="metadata-label">Injury / Death Summary</div>
                    <input type="text" className="form-control" value={extractedFacts.injury_or_death || ''} onChange={(e) => setExtractedFacts({...extractedFacts, injury_or_death: e.target.value})} />
                    <div className={`confidence-indicator ${getConfidenceClass(confidenceScores.injury_or_death)}`}>
                      {confidenceScores.injury_or_death ? `${Math.round(confidenceScores.injury_or_death * 100)}%` : '—'}
                    </div>
                  </div>

                  <div className="fact-row">
                    <div className="metadata-label">Police Station</div>
                    <input type="text" className="form-control" value={extractedFacts.police_station || ''} onChange={(e) => setExtractedFacts({...extractedFacts, police_station: e.target.value})} />
                    <div className={`confidence-indicator ${getConfidenceClass(confidenceScores.police_station)}`}>
                      {confidenceScores.police_station ? `${Math.round(confidenceScores.police_station * 100)}%` : '—'}
                    </div>
                  </div>

                  <div className="fact-row">
                    <div className="metadata-label">District & State</div>
                    <input type="text" className="form-control" value={extractedFacts.district_state || ''} onChange={(e) => setExtractedFacts({...extractedFacts, district_state: e.target.value})} />
                    <div className={`confidence-indicator ${getConfidenceClass(confidenceScores.district_state)}`}>
                      {confidenceScores.district_state ? `${Math.round(confidenceScores.district_state * 100)}%` : '—'}
                    </div>
                  </div>

                  <div className="fact-row" style={{ alignItems: 'flex-start' }}>
                    <div className="metadata-label" style={{ paddingTop: '8px' }}>Supporting Information</div>
                    <textarea className="form-control" style={{ minHeight: '60px' }} value={extractedFacts.supporting_information || ''} onChange={(e) => setExtractedFacts({...extractedFacts, supporting_information: e.target.value})}></textarea>
                    <div className={`confidence-indicator ${getConfidenceClass(confidenceScores.supporting_information)}`} style={{ paddingTop: '8px' }}>
                      {confidenceScores.supporting_information ? `${Math.round(confidenceScores.supporting_information * 100)}%` : '—'}
                    </div>
                  </div>

                  <div className="fact-row" style={{ alignItems: 'flex-start' }}>
                    <div className="metadata-label" style={{ paddingTop: '8px' }}>Claim Narrative</div>
                    <textarea className="form-control" value={extractedFacts.FIR_cause_narrative || ''} onChange={(e) => setExtractedFacts({...extractedFacts, FIR_cause_narrative: e.target.value})}></textarea>
                    <div className={`confidence-indicator ${getConfidenceClass(confidenceScores.FIR_cause_narrative)}`} style={{ paddingTop: '8px' }}>
                      {confidenceScores.FIR_cause_narrative ? `${Math.round(confidenceScores.FIR_cause_narrative * 100)}%` : '—'}
                    </div>
                  </div>
                </div>

                <div style={{ display: 'flex', gap: '16px', justifyContent: 'flex-end' }}>
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
            {/* Header Details Card */}
            <div className="card" style={{ marginBottom: '32px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '20px' }}>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '8px' }}>
                    <h2>Claim Number: {currentCase.claim_id}</h2>
                    {currentCase.status === 'Searching' ? (
                      <span className="badge badge-medium pulse-badge" style={{ color: 'var(--color-medium)' }}>Executing Public Search...</span>
                    ) : currentCase.risk_level === 'HIGH REVIEW' ? (
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

                {currentCase.status === 'Completed' && (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px' }}>
                    <a href={`${API_BASE}/cases/${currentCase.claim_id}/export-excel`} className="btn btn-secondary">
                      <FileSpreadsheet size={16} style={{ color: '#27ae60' }} /> Export Excel Pack
                    </a>
                    <a href={`${API_BASE}/cases/${currentCase.claim_id}/export-pdf`} target="_blank" rel="noopener noreferrer" className="btn btn-secondary">
                      <Download size={16} style={{ color: 'var(--primary)' }} /> Save PDF Report
                    </a>
                    
                    {/* Quest Pushback action */}
                    <button 
                      className="btn btn-secondary" 
                      onClick={handleQuestPushback} 
                      disabled={pushingToQuest || currentCase.pushback_status.includes('Success')}
                    >
                      {pushingToQuest ? <RefreshCw className="animate-spin" size={16} /> : <ArrowUpRight size={16} />}
                      {currentCase.pushback_status.includes('Success') ? 'Synced to Quest' : 'Push to Quest API'}
                    </button>

                    {activeRole === 'Investigator' && (
                      <>
                        <div style={{ borderLeft: '1px solid var(--border-card)', height: '40px', margin: '0 8px' }}></div>
                        <button className="btn btn-success" onClick={() => handleUpdateStatus('Investigated - Approved')}>
                          <CheckCircle size={16} /> Approve Claim
                        </button>
                        <button className="btn btn-danger" onClick={() => handleUpdateStatus('Investigated - Flagged')}>
                          <AlertTriangle size={16} /> Flag Fraud
                        </button>
                      </>
                    )}
                  </div>
                )}
              </div>

              {/* Quest pushback status notification */}
              {pushSuccess && (
                <div className="btn-success" style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 16px', borderRadius: '4px', marginTop: '16px', fontSize: '12px', fontWeight: 'bold' }}>
                  <CheckCircle size={14} />
                  Simulated API push success: Claims evidence JSON transaction synchronized to Quest Investigation Portal database.
                </div>
              )}

              {/* In-Progress Search Loader */}
              {currentCase.status === 'Searching' && (
                <div style={{ background: 'rgba(255,255,255,0.01)', border: '1px dashed var(--border-card)', borderRadius: '8px', padding: '20px', marginTop: '20px', display: 'flex', alignItems: 'center', gap: '20px' }}>
                  <div className="spinner" style={{ width: '32px', height: '32px', margin: 0 }}></div>
                  <div>
                    <h4 style={{ color: 'var(--color-medium)', marginBottom: '4px' }}>AI-Powered Evidence Discovery Running</h4>
                    <p style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
                      Query expansion active. Searching Google, news portals, and social media (Facebook/Instagram) for claim parameters.
                    </p>
                  </div>
                </div>
              )}

              {/* Closed status banner */}
              {currentCase.status.includes('Investigated') && (
                <div className={currentCase.status.includes('Approved') ? 'btn-success' : 'btn-danger'} 
                     style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '12px 20px', borderRadius: '8px', marginTop: '20px', fontSize: '14px', fontWeight: 'bold' }}>
                  {currentCase.status.includes('Approved') ? <CheckCircle size={18} /> : <AlertTriangle size={18} />}
                  Claim investigation review completed. Decision status: {currentCase.status.toUpperCase()}.
                </div>
              )}
            </div>

            {/* Split Screen Grid */}
            <div className="grid-main">
              
              {/* Left Side Panel: Ingested Facts (Read-only for RCU Team, editable for Investigator if in review status) */}
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
                        {currentCase.vehicle_numbers ? currentCase.vehicle_numbers.split(',').map((num, idx) => (
                          <span key={idx} className="metadata-value" style={{ fontWeight: '600' }}>
                            🚘 {num.trim()} ({currentCase.vehicle_types.split(',')[idx] || 'Unknown'})
                          </span>
                        )) : 'N/A'}
                      </div>
                    </div>
                    <div>
                      <div className="form-label">Parties Involved</div>
                      <div className="metadata-value">{currentCase.parties_involved ? currentCase.parties_involved.split(',').join(', ') : 'N/A'}</div>
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

                {/* Photo Uploader (Only visible for Investigator role in write-mode) */}
                {currentCase.status === 'Completed' && activeRole === 'Investigator' && (
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
                
                {/* 1. ADAAPT AI EVIDENCE SUMMARY MODULE CARD */}
                {currentCase.status === 'Completed' && currentCase.ai_summary && (
                  <div className="ai-summary-card">
                    <div className="ai-summary-title">
                      <Shield size={18} style={{ color: 'var(--primary)' }} />
                      <span>AI Evidence Discovery Summary</span>
                    </div>
                    <div className="ai-summary-content" dangerouslySetInnerHTML={{ 
                      __html: currentCase.ai_summary
                        .replace(/\n/g, '<br>')
                        .replace(/### /g, '<h4>')
                        .replace(/###/g, '</h4>')
                        .replace(/\* \*\*/g, '<strong>')
                        .replace(/\*\*: /g, '</strong>: ')
                        .replace(/\* /g, '• ')
                    }} />
                    <div className="ai-summary-disclaimer">
                      *Disclaimer: This summary is generated dynamically from crawled search index data. All decisions remain the responsibility of authorized Universal Sompo investigators.*
                    </div>
                  </div>
                )}

                {/* 2. Analysis Details Tab Panel */}
                <div className="card" style={{ minHeight: '500px' }}>
                  
                  <div className="tab-container">
                    <button className={`tab-btn ${detailTab === 'facts' ? 'active' : ''}`} onClick={() => setDetailTab('facts')}>
                      <FileText size={16} /> Fact Profile
                    </button>
                    <button className={`tab-btn ${detailTab === 'evidence' ? 'active' : ''}`} onClick={() => setDetailTab('evidence')}>
                      <Search size={16} /> Public Evidence ({currentCase.evidences ? currentCase.evidences.length : 0})
                    </button>
                    <button className={`tab-btn ${detailTab === 'mismatch' ? 'active' : ''}`} onClick={() => setDetailTab('mismatch')}>
                      <AlertTriangle size={16} /> Mismatch flags
                    </button>
                    <button className={`tab-btn ${detailTab === 'lens' ? 'active' : ''}`} onClick={() => setDetailTab('lens')}>
                      <Eye size={16} /> Google Lens ({currentCase.image_matches ? currentCase.image_matches.length : 0})
                    </button>
                    <button className={`tab-btn ${detailTab === 'audit' ? 'active' : ''}`} onClick={() => setDetailTab('audit')}>
                      <ClipboardList size={16} /> Audit Log
                    </button>
                  </div>

                  {/* TAB 1: FACT PROFILE & SYNC STATUS */}
                  {detailTab === 'facts' && (
                    <div>
                      <h4 style={{ marginBottom: '16px' }}>Normal Ingestion Profile Summary</h4>
                      <div className="grid-2" style={{ gap: '20px' }}>
                        <div style={{ padding: '16px', background: 'rgba(255,255,255,0.01)', border: '1px solid var(--border-card)', borderRadius: '8px' }}>
                          <h5 style={{ color: 'var(--primary)', marginBottom: '12px' }}>Quest Portal Integration</h5>
                          <div className="metadata-grid">
                            <span className="metadata-label">Claim Number:</span>
                            <span className="metadata-value">{currentCase.claim_id}</span>
                            <span className="metadata-label">Policy ID:</span>
                            <span className="metadata-value">{currentCase.policy_information || 'N/A'}</span>
                            <span className="metadata-label">Sync Status:</span>
                            <span className="metadata-value" style={{ fontWeight: 'bold', color: currentCase.pushback_status.includes('Success') ? 'var(--color-low)' : 'var(--text-secondary)' }}>
                              {currentCase.pushback_status}
                            </span>
                            {currentCase.pushback_timestamp && (
                              <>
                                <span className="metadata-label">Sync Time:</span>
                                <span className="metadata-value" style={{ fontSize: '11px' }}>{currentCase.pushback_timestamp}</span>
                              </>
                            )}
                          </div>
                        </div>

                        <div style={{ padding: '16px', background: 'rgba(255,255,255,0.01)', border: '1px solid var(--border-card)', borderRadius: '8px' }}>
                          <h5 style={{ color: 'var(--primary)', marginBottom: '12px' }}>Evidence Finder Output</h5>
                          <div className="metadata-grid">
                            <span className="metadata-label">Evidence Index:</span>
                            <span className="metadata-value" style={{ fontWeight: 'bold' }}>{currentCase.overall_score.toFixed(2)} / 1.00</span>
                            <span className="metadata-label">Threat Level:</span>
                            <span className="metadata-value">{currentCase.risk_level}</span>
                            <span className="metadata-label">Flagged Mismatches:</span>
                            <span className="metadata-value" style={{ color: 'var(--color-high)', fontWeight: 'bold' }}>
                              {currentCase.top_mismatches ? currentCase.top_mismatches.toUpperCase() : 'None'}
                            </span>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* TAB 2: EVIDENCE LINKS (WITH FB/IG SOCIAL TAGS) */}
                  {detailTab === 'evidence' && (
                    <div>
                      {currentCase.status === 'Searching' ? (
                        <div className="loading-container">
                          <div className="spinner"></div>
                          <p>Executing parallel search & scoring engine...</p>
                        </div>
                      ) : !currentCase.evidences || currentCase.evidences.length === 0 ? (
                        <div style={{ textAlign: 'center', padding: '40px 0', color: 'var(--text-muted)' }}>
                          <Search size={32} style={{ marginBottom: '12px' }} />
                          <p>No public evidence logs found. Initiate search by confirming claim facts.</p>
                        </div>
                      ) : (
                        <div>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                            <h4>Ranked Search Results (Top 10)</h4>
                            <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>crawled and deduped from broad web search</span>
                          </div>
                          
                          <div className="table-container">
                            <table className="custom-table" style={{ fontSize: '12px' }}>
                              <thead>
                                <tr>
                                  <th style={{ width: '50px' }}>Rank</th>
                                  <th style={{ width: '100px' }}>Source</th>
                                  <th>Evidence Title & URL</th>
                                  <th style={{ width: '70px', textAlign: 'center' }}>Score</th>
                                  <th>Matching Rationale</th>
                                </tr>
                              </thead>
                              <tbody>
                                {currentCase.evidences.map((ev, index) => (
                                  <tr key={ev.id}>
                                    <td style={{ fontWeight: 'bold', textAlign: 'center' }}>{index + 1}</td>
                                    <td>
                                      <span className={`source-tag tag-${ev.source.toLowerCase()}`}>
                                        {ev.source}
                                      </span>
                                    </td>
                                    <td>
                                      <div style={{ fontWeight: 'bold', marginBottom: '4px', color: '#fff' }}>{ev.title}</div>
                                      <a href={ev.url} target="_blank" rel="noopener noreferrer" style={{ display: 'flex', alignItems: 'center', gap: '4px', color: 'var(--primary)', textDecoration: 'none', fontSize: '10px' }}>
                                        {ev.url.substring(0, 50)}... <ExternalLink size={10} />
                                      </a>
                                    </td>
                                    <td style={{ textAlign: 'center', fontWeight: 'bold' }}>
                                      <span style={{ 
                                        color: ev.score >= 0.8 ? 'var(--color-low)' : 
                                               ev.score >= 0.6 ? 'var(--color-medium)' : 'var(--color-high)'
                                      }}>
                                        {ev.score.toFixed(2)}
                                      </span>
                                    </td>
                                    <td style={{ color: 'var(--text-secondary)', fontSize: '11px' }}>{ev.why_relevant}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
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
                          <p>Analyzing evidence discrepancies...</p>
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
                                    color: img.status.includes('Stock') ? 'var(--color-high)' : 
                                           img.status.includes('Prior') ? 'var(--color-medium)' : 'var(--color-low)'
                                  }}>
                                    ● {img.status.toUpperCase()}
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

      </main>
      
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
