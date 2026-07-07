import datetime
from sqlalchemy import Column, Integer, String, Float, Boolean, Text, ForeignKey, DateTime
from sqlalchemy.orm import relationship
from backend.database import Base

class Case(Base):
    __tablename__ = "cases"

    id = Column(Integer, primary_key=True, index=True)
    claim_id = Column(String, unique=True, index=True, nullable=False)
    policy_information = Column(String, nullable=True)
    supporting_information = Column(String, nullable=True)
    
    accident_date_time = Column(String, nullable=True)
    loss_location = Column(String, nullable=True)
    vehicle_numbers = Column(String, nullable=True)  # Comma-separated or JSON string
    vehicle_types = Column(String, nullable=True)    # Comma-separated or JSON string
    parties_involved = Column(String, nullable=True) # Comma-separated or JSON string
    injury_or_death = Column(String, nullable=True)
    FIR_cause_narrative = Column(Text, nullable=True)
    police_station = Column(String, nullable=True)
    district_state = Column(String, nullable=True)
    confidence_scores = Column(Text, nullable=True)  # JSON string
    
    confirmed = Column(Boolean, default=False)
    overall_score = Column(Float, default=0.0)
    risk_level = Column(String, default="Pending Review")
    status = Column(String, default="Pending Ingestion")
    
    ai_summary = Column(Text, nullable=True)  # AI Summary Generation
    pushback_status = Column(String, default="Not Pushed")  # Quest API Pushback Simulator
    pushback_timestamp = Column(String, nullable=True)
    
    top_mismatches = Column(String, nullable=True)  # JSON/Comma-separated list of flagged categories
    mismatch_cause = Column(Text, nullable=True)
    mismatch_location = Column(Text, nullable=True)
    mismatch_time = Column(Text, nullable=True)
    mismatch_vehicle = Column(Text, nullable=True)
    mismatch_entity = Column(Text, nullable=True)
    
    created_at = Column(DateTime, default=datetime.datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.datetime.utcnow, onupdate=datetime.datetime.utcnow)

    evidences = relationship("Evidence", back_populates="case", cascade="all, delete-orphan")
    image_matches = relationship("ImageMatch", back_populates="case", cascade="all, delete-orphan")
    audit_logs = relationship("AuditLog", back_populates="case", cascade="all, delete-orphan")

class Evidence(Base):
    __tablename__ = "evidences"

    id = Column(Integer, primary_key=True, index=True)
    case_id = Column(Integer, ForeignKey("cases.id", ondelete="CASCADE"), nullable=False)
    source = Column(String, nullable=False)  # Quest, News, Web, Facebook, Instagram, Image
    title = Column(String, nullable=True)
    url = Column(String, nullable=True)
    snippet = Column(Text, nullable=True)
    score = Column(Float, default=0.0)
    why_relevant = Column(Text, nullable=True)
    publish_date = Column(String, nullable=True)
    query_used = Column(String, nullable=True)

    case = relationship("Case", back_populates="evidences")

class ImageMatch(Base):
    __tablename__ = "image_matches"

    id = Column(Integer, primary_key=True, index=True)
    case_id = Column(Integer, ForeignKey("cases.id", ondelete="CASCADE"), nullable=False)
    image_name = Column(String, nullable=False)
    image_path = Column(String, nullable=True)
    status = Column(String, default="Original")  # Original, Reused - Stock, Reused - Prior
    matched_url = Column(String, nullable=True)
    why_matched = Column(Text, nullable=True)

    case = relationship("Case", back_populates="image_matches")

class AuditLog(Base):
    __tablename__ = "audit_logs"

    id = Column(Integer, primary_key=True, index=True)
    case_id = Column(Integer, ForeignKey("cases.id", ondelete="CASCADE"), nullable=True)
    action = Column(String, nullable=False)
    details = Column(Text, nullable=True)
    timestamp = Column(DateTime, default=datetime.datetime.utcnow)

    case = relationship("Case", back_populates="audit_logs")
