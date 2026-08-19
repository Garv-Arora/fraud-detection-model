// Comprehensive Fallback & Demo Portfolio for Universal Sompo AI Evidence Finder
// Ensures 100% interactive functionality on Netlify even before live backend URL is configured

export const FALLBACK_CASES = [
  {
    id: 1,
    claim_id: "TP-RCU-UP-00517/2025",
    policy_information: "POL-998877-2025",
    supporting_information: "Previous claim registered for vehicle UP-85-AT-9988 in 2023 for front bumper damage.",
    insured_name: "Ramesh Kumar",
    insured_address: "Kosi Kalan, Mathura, Uttar Pradesh",
    insured_contact_no: "9876543210",
    vehicle_numbers: "UP-85-AT-9988, HR-26-Z-1122",
    vehicle_make: "Honda",
    vehicle_model: "CB Shine",
    driver_name: "Ramesh Kumar",
    driver_contact_no: "DL-UP85-2020-001928",
    accident_date_time: "2025-05-12T14:30:00",
    loss_location: "near Kosi Kalan, NH-2",
    accident_location_city: "Mathura",
    accident_location_state: "Uttar Pradesh",
    accident_location_region: "North",
    vehicle_types: "Motorcycle, Truck",
    parties_involved: "Ramesh Kumar (Rider), Suresh Singh (Truck Driver)",
    injury_or_death: "Ramesh Kumar suffered head injuries, declared dead on arrival at District Hospital",
    FIR_cause_narrative: "The motorcycle UP-85-AT-9988 ridden by Ramesh Kumar was hit from behind by a speeding truck bearing registration number HR-26-Z-1122 on NH-2 near Kosi Kalan. The rider Ramesh Kumar fell onto the road and sustained fatal head injuries. The truck driver Suresh Singh fled the spot leaving the vehicle.",
    intimation_date: "2025-05-13",
    fir_date: "2025-05-12",
    fir_time: "17:00",
    police_station: "Kosi Kalan PS",
    police_station_district: "Mathura",
    state: "Uttar Pradesh",
    district_state: "Mathura, Uttar Pradesh",
    no_of_occupants: "1",
    news_check: "No local media coverage identified for this rural mishap",
    social_media_check: "Zero social media posts found matching vehicle",
    past_record_vehicle: "Prior bumper claim settled in 2023",
    call_112_check: "No emergency call logged on 112",
    call_108_check: "108 ambulance dispatch log confirmed",
    hospital_name: "District Hospital Mathura",
    crime_check: "IPC 279, 304A registered against truck driver",
    io_name: "SI Virendra Singh",
    status: "Completed",
    overall_score: 0.85,
    risk_level: "LOW RISK",
    mismatch_flags: JSON.stringify(["Corridor Match Verified", "Unlicensed Third Party Driver"]),
    ai_summary: `### ✨ Executive AI Overview
On **May 12, 2025 at approximately 2:30 PM**, a fatal road accident occurred on **NH-2 near Kosi Kalan, Mathura, Uttar Pradesh**. A two-wheeler (**UP-85-AT-9988**) ridden by **Ramesh Kumar** was rear-ended by an errant transport truck (**HR-26-Z-1122**). The impact resulted in fatal head trauma for the rider.

**Key Incident Highlights:**
- 📅 **Date & Time**: **May 12, 2025 at 2:30 PM**
- 📍 **Corridor & Spot**: **NH-2 near Kosi Kalan, Mathura, Uttar Pradesh**
- 💥 **Collision Dynamics**: Rear-end collision by heavy commercial vehicle
- 🚗 **Vehicles Involved**: Honda CB Shine (**UP-85-AT-9988**) + Truck (**HR-26-Z-1122**)
- 🏥 **Casualties & Victims**: 1 fatality (**Ramesh Kumar**)
- ⚖️ **Police & Driver Action**: FIR registered under IPC 279/304A at **Kosi Kalan PS**

### 🎯 Objectivity & Fact Verification
- **Driver Identity & DL**: Confirmed valid DL **DL-UP85-2020-001928**
- **Policy Timeline & Date**: Incident occurred within valid policy term
- **Accident Cause & Usage**: Private personal commute verified
- **Police Station Records**: GD Entry and FIR verified with Kosi Kalan PS`,
    evidences: [],
    image_matches: [
      {
        id: 1,
        image_name: "damage_spot_photo.jpg",
        status: "Original",
        matched_url: null,
        why_matched: "Verified authentic spot photo metadata."
      }
    ],
    audit_logs: [
      { id: 1, action: "Case Ingestion", details: "Claim imported into Universal Sompo portfolio.", created_at: "2025-05-13T10:00:00" },
      { id: 2, action: "Evidence Search Completed", details: "Multi-engine parallel search executed across Google News, e-Papers, and Social Media.", created_at: "2025-05-13T10:02:00" }
    ]
  },
  {
    id: 2,
    claim_id: "CL24181742",
    policy_information: "2315/74319639/00/B00",
    supporting_information: "Pre-Inception Loss: Instagram video posted on 11.07.2024 proves accident occurred before policy start date.",
    insured_name: "MRS. CHANDA CHABRA",
    insured_address: "Dehradun, Uttarakhand",
    insured_contact_no: "9812345678",
    vehicle_numbers: "UK-07-CD-2490",
    vehicle_make: "MAHINDRA",
    vehicle_model: "BOLERO MAXX PUP CITY",
    driver_name: "Gagan Chhabra",
    driver_contact_no: "DL-UK07-2018-00912",
    accident_date_time: "2024-07-14T00:30:00",
    loss_location: "Dehradun Haridwar Road, Chidderwala",
    accident_location_city: "Dehradun",
    accident_location_state: "Uttarakhand",
    accident_location_region: "North",
    vehicle_types: "Commercial Goods Vehicle",
    parties_involved: "Gagan Chhabra",
    injury_or_death: "No injuries",
    FIR_cause_narrative: "Claim states accident on 14.07.2024 (policy inception: 12.07.2024). Damage video uploaded on Instagram ID @_Its_vansh_2490 on 11.07.2024 proves pre-existing loss.",
    intimation_date: "2024-07-15",
    fir_date: "2024-07-14",
    fir_time: "02:00",
    police_station: "Raiwala PS",
    police_station_district: "Dehradun",
    state: "Uttarakhand",
    district_state: "Dehradun, Uttarakhand",
    no_of_occupants: "1",
    news_check: "News & Instagram video verified on 11.07.2024",
    social_media_check: "Instagram Reel @_Its_vansh_2490 shows pre-inception damage",
    past_record_vehicle: "No prior claims",
    call_112_check: "No call logged",
    call_108_check: "No dispatch",
    hospital_name: "N/A",
    crime_check: "No crime",
    io_name: "SI Rajesh Rawat",
    status: "Completed",
    overall_score: 0.32,
    risk_level: "HIGH REVIEW",
    mismatch_flags: JSON.stringify(["Date Mismatch", "Pre-Inception Loss Discrepancy", "Social Media Damage Reel Match"]),
    ai_summary: `### ✨ Executive AI Overview
Investigation into claim **CL24181742** uncovered a critical **Pre-Inception Loss Discrepancy**. While the claimant declared the accident occurred on **July 14, 2024** (following policy inception on July 12, 2024), forensic media discovery revealed an **Instagram damage video uploaded on July 11, 2024**, conclusively establishing that vehicle damage predated the insurance policy.

**Key Incident Highlights:**
- 📅 **Claimed Loss Date**: July 14, 2024 | **Policy Inception**: July 12, 2024
- 🚨 **Social Media Upload Timestamp**: **July 11, 2024**
- 📍 **Corridor & Spot**: Dehradun-Haridwar Road near Chidderwala
- 🚗 **Vehicle Involved**: Mahindra Bolero (**UK-07-CD-2490**)
- ⚖️ **Finding**: Pre-existing damage repudiation recommended under Section 64VB.

### 💥 Incident Dynamics & Collision Sequence
- Public Instagram Reel uploaded by user \`@_Its_vansh_2490\` on July 11, 2024 shows vehicle UK-07-CD-2490 with front cabin impact damage.
- Amar Ujala regional blotter recorded collision on Haridwar corridor on July 11, 2024.`,
    evidences: [
      {
        id: 101,
        source: "Meta",
        title: "Meta (Instagram Post) by @_Its_vansh_2490: Vehicle damage reel uploaded on 11-07-2024",
        url: "https://www.instagram.com/p/C9U1x2490/",
        snippet: "Instagram Reel uploaded on July 11, 2024 showing front cabin damage of vehicle UK-07-CD-2490. Upload timestamp (11.07.2024) is prior to the policy commencement date of 12.07.2024.",
        score: 0.95,
        published_date: "2024-07-11",
        query_used: "site:instagram.com UK-07-CD-2490"
      },
      {
        id: 102,
        source: "News",
        title: "Amar Ujala Dehradun: Chidderwala Haridwar Road Traffic Collision Update",
        url: "https://www.amarujala.com/uttar-pradesh/mathura",
        snippet: "Vehicle UK-07-CD-2490 was reported involved in a minor collision near Chidderwala Haridwar road prior to the weekend.",
        score: 0.78,
        published_date: "2024-07-11",
        query_used: "Chidderwala road accident"
      }
    ],
    image_matches: [
      {
        id: 201,
        image_name: "bolero_front_cabin.jpg",
        status: "Pre-Inception Video Upload",
        matched_url: "https://www.instagram.com/p/C9U1x2490/",
        why_matched: "Social Media Forensics: Instagram damage video uploaded on 11.07.2024 (predates policy inception date 12.07.2024)."
      }
    ],
    audit_logs: [
      { id: 10, action: "Social Media Match", details: "Instagram Reel identified with pre-inception timestamp.", created_at: "2024-07-15T11:00:00" }
    ]
  },
  {
    id: 3,
    claim_id: "CL26123008",
    policy_information: "2369/78283277/00/000",
    supporting_information: "Stunt Driving / No Valid DL: Instagram & Facebook profiles contain stunt videos of subject vehicle.",
    insured_name: "MOHIT SHARMA",
    insured_address: "Jammu, Jammu & Kashmir",
    insured_contact_no: "9419123456",
    vehicle_numbers: "JK-02-DU-7684",
    vehicle_make: "MARUTI SUZUKI",
    vehicle_model: "SWIFT",
    driver_name: "Nitan Sharma",
    driver_contact_no: "DL-NONE",
    accident_date_time: "2026-05-27T10:00:00",
    loss_location: "Village Gulaba to Khada",
    accident_location_city: "Jammu",
    accident_location_state: "Jammu & Kashmir",
    accident_location_region: "North",
    vehicle_types: "Car",
    parties_involved: "Mohit Sharma, Nitan Sharma",
    injury_or_death: "Minor abrasions",
    FIR_cause_narrative: "Driver refused to cooperate for inspection. Stunt videos found on insured's social media profiles. Neither insured nor brother holds valid driving licence.",
    intimation_date: "2026-05-28",
    fir_date: "2026-05-27",
    fir_time: "11:00",
    police_station: "Akhnoor PS",
    police_station_district: "Jammu",
    state: "Jammu & Kashmir",
    district_state: "Jammu, Jammu & Kashmir",
    no_of_occupants: "2",
    news_check: "No police GD entry found",
    social_media_check: "Facebook video & Instagram stunt driving reels identified",
    past_record_vehicle: "No prior claims",
    call_112_check: "No call logged",
    call_108_check: "No 108 log",
    hospital_name: "N/A",
    crime_check: "No crime",
    io_name: "SI Kuldeep",
    status: "Completed",
    overall_score: 0.28,
    risk_level: "HIGH REVIEW",
    mismatch_flags: JSON.stringify(["Driver Implant", "Hazardous Stunt Driving", "Unlicensed Driver"]),
    ai_summary: `### ✨ Executive AI Overview
Investigation into claim **CL26123008** identified multiple severe non-disclosures. Public social media video discovery on **Facebook** and **Instagram** revealed that the subject vehicle (**JK-02-DU-7684**) was actively deployed in extreme road drifting and hazardous speed stunts. Furthermore, neither the insured nor the driver possesses a valid Driving Licence.

**Key Incident Highlights:**
- 📅 **Date & Time**: May 27, 2026 at 10:00 AM
- 📍 **Corridor**: Village Gulaba to Khada, Akhnoor PS jurisdiction
- 🚗 **Vehicle Involved**: Maruti Swift (**JK-02-DU-7684**)
- 📹 **Social Forensics**: Public Facebook drifting video & Instagram stunt reel confirmed
- ⚖️ **Finding**: Repudiation recommended due to unlicensed driver and hazardous vehicle abuse.`,
    evidences: [
      {
        id: 301,
        source: "YouTube",
        title: "YouTube Videos: Live footage of Swift stunt drifting in Jammu Akhnoor",
        url: "https://www.youtube.com/results?search_query=JK02+Swift+car+stunt+drift+Akhnoor",
        snippet: "Public YouTube search feed showing driver performing road stunts and drifts in subject vehicle. Registration plate match.",
        score: 0.92,
        published_date: "2026-05-27",
        query_used: "stunt driving accident Jammu"
      }
    ],
    image_matches: [
      {
        id: 303,
        image_name: "stunt_swift_modification.jpg",
        status: "Hazardous Stunt Use",
        matched_url: "https://www.instagram.com/explore/search/keyword/?q=JK02+Swift+car+stunt+drift+Akhnoor",
        why_matched: "Visual match with public social media stunt archive."
      }
    ],
    audit_logs: [
      { id: 20, action: "Social Forensics", details: "Facebook and Instagram stunt footage linked to case file.", created_at: "2026-05-28T09:00:00" }
    ]
  },
  {
    id: 4,
    claim_id: "CL26121725",
    policy_information: "2367/82275066/00/000",
    supporting_information: "Commercial Use / Barat Procession: Newspaper confirms vehicle hired for marriage party.",
    insured_name: "ARUN KUMAR PAL",
    insured_address: "Suriyawan, Bhadohi, Uttar Pradesh",
    insured_contact_no: "9792001122",
    vehicle_numbers: "UP-66-K-9912",
    vehicle_make: "MARUTI SUZUKI",
    vehicle_model: "ERTIGA",
    driver_name: "Arun Kumar Pal (Implanted)",
    driver_contact_no: "DL-UP66-2021-00129",
    accident_date_time: "2026-05-01T22:30:00",
    loss_location: "near Durgaganj, Suriyawan Road",
    accident_location_city: "Bhadohi",
    accident_location_state: "Uttar Pradesh",
    accident_location_region: "North",
    vehicle_types: "Private Passenger Car",
    parties_involved: "Manjeet Pal (Groom), Veeru Pal, Sweety Pal, Ansh Pal",
    injury_or_death: "5 occupants in marriage procession injured",
    FIR_cause_narrative: "Private Ertiga vehicle was hired for a wedding procession (Barat). Vehicle rammed into a truck near Durgaganj PS. Insured Arun Pal falsely claimed private family use, whereas news reports confirm commercial wedding hire.",
    intimation_date: "2026-05-03",
    fir_date: "2026-05-02",
    fir_time: "03:00",
    police_station: "Durgaganj PS",
    police_station_district: "Bhadohi",
    state: "Uttar Pradesh",
    district_state: "Bhadohi, Uttar Pradesh",
    no_of_occupants: "5",
    news_check: "Dainik Bhaskar e-Paper verified wedding procession collision",
    social_media_check: "Regional Hindi news bulletin confirmed",
    past_record_vehicle: "No prior claims",
    call_112_check: "112 emergency response call logged",
    call_108_check: "108 ambulance dispatch log verified",
    hospital_name: "Community Health Center Suriyawan",
    crime_check: "GD entry #14 at Durgaganj PS",
    io_name: "SI Ramakant",
    status: "Completed",
    overall_score: 0.38,
    risk_level: "HIGH REVIEW",
    mismatch_flags: JSON.stringify(["Commercial Use in Private Policy", "Occupant Count Discrepancy", "Driver Implant"]),
    ai_summary: `### ✨ Executive AI Overview
Comprehensive investigation into claim **CL26121725** confirmed that private car **UP-66-K-9912** was operating as an unauthorized commercial hire vehicle in a wedding procession (**Barat**) when it collided with a truck near Durgaganj on **May 1, 2026**.

**Key Incident Highlights:**
- 📅 **Date & Time**: **May 1, 2026 at 10:30 PM**
- 📍 **Corridor**: **Durgaganj, Suriyawan Road, Bhadohi, UP**
- 💥 **Collision Dynamics**: Rear-end collision into truck during Barat procession
- 🚗 **Vehicles Involved**: Maruti Ertiga (**UP-66-K-9912**) + Heavy Goods Truck
- 🏥 **Injured Occupants**: Groom Manjeet Pal, Veeru Pal, Sweety Pal, Ansh Pal (5 casualties)
- ⚖️ **Finding**: Repudiation recommended due to commercial use in private vehicle policy.`,
    evidences: [
      {
        id: 401,
        source: "News",
        title: "सुरियावां में बारात जा रही कार अनियंत्रित होकर ट्रक से टकराई, दूल्हा समेत 5 घायल",
        url: "https://www.bhaskar.com/local/uttar-pradesh/bhadohi/news/wedding-car-accident-in-suriyawan-durgaganj-132890123.html",
        snippet: "भदोही के दुर्गागंज पुलिस स्टेशन के पास सोमवार रात भीषण हादसा हुआ। बारात में जा रही कार अनियंत्रित होकर ट्रक में पीछे से जा घुसी। कार में दूल्हा मनजीत पाल, वीरू पाल, स्वीटी पाल सवार थे।",
        score: 0.96,
        published_date: "2026-05-01",
        query_used: "Durgaganj barat accident"
      }
    ],
    image_matches: [],
    audit_logs: [
      { id: 30, action: "Newspaper Verification", details: "Dainik Bhaskar article corroborated wedding procession usage.", created_at: "2026-05-03T10:00:00" }
    ]
  },
  {
    id: 5,
    claim_id: "CL25096636",
    policy_information: "2369/77987822/00/000",
    supporting_information: "Driver Implant: Female driver without DL replaced with licensed brother. Hospital timestamp contradiction.",
    insured_name: "SURENDRALAL SHRIWASTAV",
    insured_address: "Husain Nagar, Gorakhpur, Uttar Pradesh",
    insured_contact_no: "9838002233",
    vehicle_numbers: "UP-53-BZ-1902",
    vehicle_make: "HONDA",
    vehicle_model: "ACTIVA 6G",
    driver_name: "Mahendra Kumar Shrivastav (Implanted)",
    driver_contact_no: "DL-UP53-2019-00441",
    accident_date_time: "2025-06-13T12:30:00",
    loss_location: "Husain Nagar, Dalya",
    accident_location_city: "Gorakhpur",
    accident_location_state: "Uttar Pradesh",
    accident_location_region: "North",
    vehicle_types: "Two Wheeler Scooter",
    parties_involved: "Anshika Mishra (Actual Unlicensed Rider)",
    injury_or_death: "Anshika Mishra sustained knee & arm fractures",
    FIR_cause_narrative: "Claim states brother Mahendra was driving at 12:30 PM. Hospital casualty slip dated 10:57 AM was registered in the name of Anshika Mishra who confirmed riding alone without DL. Spot video reveals female footwear at the accident position.",
    intimation_date: "2025-06-14",
    fir_date: "2025-06-13",
    fir_time: "15:00",
    police_station: "Gorakhpur Cantt PS",
    police_station_district: "Gorakhpur",
    state: "Uttar Pradesh",
    district_state: "Gorakhpur, Uttar Pradesh",
    no_of_occupants: "1",
    news_check: "Medical College Hospital register timed prior to claimed loss time",
    social_media_check: "Spot video confirms women's footwear at driver position",
    past_record_vehicle: "No prior claims",
    call_112_check: "No 112 log",
    call_108_check: "108 ambulance log timed 11:05 AM",
    hospital_name: "BRD Medical College Gorakhpur",
    crime_check: "GD entry at Cantt PS",
    io_name: "SI Anand Kumar",
    status: "Completed",
    overall_score: 0.40,
    risk_level: "HIGH REVIEW",
    mismatch_flags: JSON.stringify(["Driver Implant", "Hospital Timestamp Contradiction", "Spot Video Female Footwear Discrepancy"]),
    ai_summary: `### ✨ Executive AI Overview
Investigation into claim **CL25096636** revealed a definitive **Driver Implant and Temporal Contradiction**. The claimant stated the two-wheeler was ridden by **Mahendra Kumar Shrivastav** at 12:30 PM. However, BRD Medical College casualty records show patient **Anshika Mishra** was admitted at **10:57 AM** (over 90 minutes prior to claimed time) and spot footage confirmed female footwear at the rider position.

**Key Incident Highlights:**
- 📅 **Claimed Time**: 12:30 PM | **Actual Hospital Admission**: **10:57 AM**
- 📍 **Spot**: Husain Nagar, Gorakhpur Cantt PS
- 🛵 **Vehicle**: Honda Activa (**UP-53-BZ-1902**)
- 🚨 **Discrepancy**: Hospital timestamp precedes accident by 90 minutes; female rider had no DL
- ⚖️ **Finding**: Repudiation recommended under Section 64VB & fraud condition.`,
    evidences: [],
    image_matches: [
      {
        id: 501,
        image_name: "spot_scooter_footwear.jpg",
        status: "Driver Implant Evidence",
        matched_url: null,
        why_matched: "Spot Video Analysis: Women's footwear visible by driver footboard; contradicts claimed male driver."
      }
    ],
    audit_logs: [
      { id: 40, action: "Hospital Verification", details: "Casualty register retrieved from BRD Medical College.", created_at: "2025-06-14T14:00:00" }
    ]
  }
];
