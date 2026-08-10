import datetime
from sqlalchemy import Column, Integer, String, Float, Boolean, Text, ForeignKey, DateTime
from sqlalchemy.orm import relationship
from backend.database import Base

class Case(Base):
    __tablename__ = "cases"

    id = Column(Integer, primary_key=True, index=True)
    claim_id = Column(String, unique=True, index=True, nullable=False) # 1. Claim No
    policy_information = Column(String, nullable=True)
    supporting_information = Column(String, nullable=True)
    
    # Tera Bot 30-Header Attributes
    insured_name = Column(String, nullable=True)             # 2. Insured Name
    insured_address = Column(String, nullable=True)          # 3. Insured Address
    insured_contact_no = Column(String, nullable=True)       # 4. Insured Contact No
    vehicle_numbers = Column(String, nullable=True)          # 5. Vehicle No (Comma-separated/string)
    vehicle_make = Column(String, nullable=True)             # 6. Vehicle Make
    vehicle_model = Column(String, nullable=True)            # 7. Vehicle Model
    driver_name = Column(String, nullable=True)              # 8. Driver Name
    driver_contact_no = Column(String, nullable=True)        # 9. Driver Contact No
    spot_of_accident = Column(String, nullable=True)         # 10. Spot of Accident
    accident_date_time = Column(String, nullable=True)       # 11. Date of Accident
    accident_location_city = Column(String, nullable=True)   # 12. Accident Location City
    accident_location_state = Column(String, nullable=True)  # 13. Accident Location State
    accident_location_region = Column(String, nullable=True) # 14. Accident Location Region
    FIR_cause_narrative = Column(Text, nullable=True)        # 15. Cause of accident/ Nature of loss
    intimation_date = Column(String, nullable=True)          # 16. Intimation Date
    fir_date = Column(String, nullable=True)                 # 17. FIR Date
    fir_time = Column(String, nullable=True)                 # 18. FIR Time
    police_station = Column(String, nullable=True)           # 19. Police Station Name
    police_station_district = Column(String, nullable=True)  # 20. Police Station District
    state = Column(String, nullable=True)                    # 21. State
    no_of_occupants = Column(String, nullable=True)          # 22. No of occupants
    news_check = Column(String, nullable=True)               # 23. News check
    social_media_check = Column(String, nullable=True)       # 24. Social Media Check
    past_record_vehicle = Column(String, nullable=True)      # 25. Past record of vehicle
    call_112_check = Column(String, nullable=True)           # 26. Call on 112
    call_108_check = Column(String, nullable=True)           # 27. Call on 108
    hospital_name = Column(String, nullable=True)            # 28. Hospital Name
    crime_check = Column(String, nullable=True)              # 29. Crime Check
    io_name = Column(String, nullable=True)                  # 30. IO Name

    # System/Ingestion metadata
    loss_location = Column(String, nullable=True)
    vehicle_types = Column(String, nullable=True)
    parties_involved = Column(String, nullable=True)
    injury_or_death = Column(String, nullable=True)
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
