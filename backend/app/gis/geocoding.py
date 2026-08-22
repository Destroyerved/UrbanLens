"""Geocoding, Landmark Search, and POI Resolution Service for UrbanLens.

Supports:
1. Instant curated directory of high-priority academic, government, healthcare,
   and cultural landmarks (e.g. Institute of Advanced Research, IIT, IIM, GIFT City, etc.).
2. Dynamic spatial matching against loaded parcels and wards for the active city.
3. Live OpenStreetMap (Nominatim & Photon) geocoding fallback for any location worldwide.
"""

from __future__ import annotations

import json
import re
import urllib.parse
import urllib.request
from typing import Any

LANDMARK_DIRECTORY: list[dict[str, Any]] = [
    # Academic & Research Institutions
    {
        "id": "iar-gandhinagar",
        "name": "Institute of Advanced Research (IAR)",
        "aliases": ["iar", "iar gandhinagar", "institute of advanced research", "iar university", "koba iar", "institue of advancerd research"],
        "category": "university",
        "category_label": "Research University",
        "city_id": "gandhinagar",
        "city_name": "Gandhinagar",
        "address": "Institutional Area, Koba, Gandhinagar, Gujarat 382007",
        "coord": [72.6697, 23.1486],
        "zoom": 16.0,
        "description": "Premier university & research institute in life sciences, biotechnology, engineering and computer science.",
    },
    {
        "id": "iit-gandhinagar",
        "name": "IIT Gandhinagar (IITGN)",
        "aliases": ["iit gandhinagar", "iitgn", "iit gn", "indian institute of technology gandhinagar", "palaj iit"],
        "category": "university",
        "category_label": "Institute of National Importance",
        "city_id": "gandhinagar",
        "city_name": "Gandhinagar",
        "address": "Palaj, Gandhinagar, Gujarat 382355",
        "coord": [72.6841, 23.2125],
        "zoom": 15.5,
        "description": "Autonomous premier engineering institution along the Sabarmati river.",
    },
    {
        "id": "iim-ahmedabad",
        "name": "IIM Ahmedabad (IIMA)",
        "aliases": ["iim ahmedabad", "iima", "iim a", "indian institute of management ahmedabad", "vastrapur iim"],
        "category": "university",
        "category_label": "Management Institute",
        "city_id": "ahmedabad",
        "city_name": "Ahmedabad",
        "address": "Vastrapur, Ahmedabad, Gujarat 380015",
        "coord": [72.5350, 23.0315],
        "zoom": 15.5,
        "description": "World-renowned management institute designed by architect Louis Kahn.",
    },
    {
        "id": "cept-university",
        "name": "CEPT University",
        "aliases": ["cept", "cept university", "centre for environmental planning and technology", "navrangpura cept"],
        "category": "university",
        "category_label": "Architecture & Planning Institute",
        "city_id": "ahmedabad",
        "city_name": "Ahmedabad",
        "address": "Kasturbhai Lalbhai Campus, University Rd, Navrangpura, Ahmedabad 380009",
        "coord": [72.5489, 23.0378],
        "zoom": 15.5,
        "description": "Premier architecture, design, urban planning, and human habitat university.",
    },
    {
        "id": "nid-ahmedabad",
        "name": "National Institute of Design (NID)",
        "aliases": ["nid", "nid ahmedabad", "national institute of design", "paldi nid"],
        "category": "university",
        "category_label": "Design Institute",
        "city_id": "ahmedabad",
        "city_name": "Ahmedabad",
        "address": "Opp Tagore Hall, Paldi, Ahmedabad, Gujarat 380007",
        "coord": [72.5694, 23.0118],
        "zoom": 15.5,
        "description": "Internationally acclaimed design school established in 1961.",
    },
    {
        "id": "daiict-gandhinagar",
        "name": "DA-IICT (Dhirubhai Ambani Institute)",
        "aliases": ["daiict", "da-iict", "dhirubhai ambani institute", "daiict gandhinagar"],
        "category": "university",
        "category_label": "ICT University",
        "city_id": "gandhinagar",
        "city_name": "Gandhinagar",
        "address": "Near Indroda Circle, Gandhinagar, Gujarat 382007",
        "coord": [72.6289, 23.1884],
        "zoom": 15.5,
        "description": "Leading ICT engineering and research institution in Gandhinagar.",
    },
    {
        "id": "pdpu-gandhinagar",
        "name": "PDEU / PDPU (Pandit Deendayal Energy University)",
        "aliases": ["pdpu", "pdeu", "pandit deendayal energy university", "pdpu gandhinagar", "raysan pdpu"],
        "category": "university",
        "category_label": "Energy University",
        "city_id": "gandhinagar",
        "city_name": "Gandhinagar",
        "address": "Knowledge Corridor, Raysan, Gandhinagar, Gujarat 382007",
        "coord": [72.6644, 23.1558],
        "zoom": 15.5,
        "description": "World-class university focused on energy education, solar, and renewables.",
    },
    {
        "id": "nfsu-gandhinagar",
        "name": "National Forensic Sciences University (NFSU)",
        "aliases": ["nfsu", "national forensic sciences university", "gfsu", "gujarat forensic"],
        "category": "university",
        "category_label": "Forensic Sciences University",
        "city_id": "gandhinagar",
        "city_name": "Gandhinagar",
        "address": "Sector 9, Gandhinagar, Gujarat 382007",
        "coord": [72.6375, 23.1970],
        "zoom": 15.5,
        "description": "World's first and only university dedicated to forensic and investigative sciences.",
    },
    {
        "id": "gnlu-gandhinagar",
        "name": "Gujarat National Law University (GNLU)",
        "aliases": ["gnlu", "gujarat national law university", "koba gnlu"],
        "category": "university",
        "category_label": "National Law University",
        "city_id": "gandhinagar",
        "city_name": "Gandhinagar",
        "address": "Attalika Avenue, Knowledge Corridor, Koba, Gandhinagar 382007",
        "coord": [72.6258, 23.1539],
        "zoom": 15.5,
        "description": "Statutory national law university imparting comprehensive legal education.",
    },
    {
        "id": "nirma-university",
        "name": "Nirma University",
        "aliases": ["nirma", "nirma university", "nirma sg highway"],
        "category": "university",
        "category_label": "University",
        "city_id": "ahmedabad",
        "city_name": "Ahmedabad",
        "address": "S.G. Highway, Gota, Ahmedabad, Gujarat 382481",
        "coord": [72.5452, 23.1287],
        "zoom": 15.5,
        "description": "Major technical and professional university situated on Sarkhej-Gandhinagar Highway.",
    },
    {
        "id": "prl-ahmedabad",
        "name": "Physical Research Laboratory (PRL)",
        "aliases": ["prl", "physical research laboratory", "prl ahmedabad"],
        "category": "research",
        "category_label": "Space & Physics Lab",
        "city_id": "ahmedabad",
        "city_name": "Ahmedabad",
        "address": "Navrangpura, Ahmedabad, Gujarat 380009",
        "coord": [72.5458, 23.0335],
        "zoom": 15.5,
        "description": "Premier national research institute for space and allied sciences founded by Dr. Vikram Sarabhai.",
    },
    {
        "id": "isro-sac",
        "name": "ISRO Space Applications Centre (SAC)",
        "aliases": ["isro", "isro sac", "space applications centre", "isro satellite"],
        "category": "research",
        "category_label": "Space Agency Centre",
        "city_id": "ahmedabad",
        "city_name": "Ahmedabad",
        "address": "Ambawadi Vistar, Jodhpur Tekra, Ahmedabad, Gujarat 380015",
        "coord": [72.5186, 23.0232],
        "zoom": 15.5,
        "description": "Lead centre of ISRO for developing space-borne payloads for communication and remote sensing.",
    },

    # Major Financial, Tech & Governance Landmarks
    {
        "id": "gift-city",
        "name": "GIFT City (Gujarat International Finance Tec-City)",
        "aliases": ["gift city", "gift", "gujarat international finance tec-city", "gift ifsc"],
        "category": "business",
        "category_label": "International Financial Hub",
        "city_id": "gandhinagar",
        "city_name": "Gandhinagar",
        "address": "GIFT City, Gandhinagar, Gujarat 382355",
        "coord": [72.6845, 23.1610],
        "zoom": 14.8,
        "description": "India's first operational smart city and International Financial Services Centre (IFSC).",
    },
    {
        "id": "infocity-gandhinagar",
        "name": "Infocity Gandhinagar",
        "aliases": ["infocity", "infocity gandhinagar", "infocity it park"],
        "category": "business",
        "category_label": "IT / Tech Hub",
        "city_id": "gandhinagar",
        "city_name": "Gandhinagar",
        "address": "Infocity, Gandhinagar, Gujarat 382007",
        "coord": [72.6272, 23.1930],
        "zoom": 15.2,
        "description": "Major information technology park and business hub in Gandhinagar.",
    },
    {
        "id": "mahatma-mandir",
        "name": "Mahatma Mandir Convention Centre",
        "aliases": ["mahatma mandir", "mahatma mandir gandhinagar", "vibrant gujarat venue"],
        "category": "landmark",
        "category_label": "Convention & Exhibition Center",
        "city_id": "gandhinagar",
        "city_name": "Gandhinagar",
        "address": "Sector 13, Gandhinagar, Gujarat 382016",
        "coord": [72.6468, 23.2325],
        "zoom": 15.0,
        "description": "One of India's biggest convention & exhibition centres, host of Vibrant Gujarat Summits.",
    },
    {
        "id": "sachivalaya-gandhinagar",
        "name": "Gujarat Sachivalaya (New Secretariat)",
        "aliases": ["sachivalaya", "swarnim sankul", "secretariat", "gujarat assembly", "vidhan sabha"],
        "category": "government",
        "category_label": "State Government Headquarters",
        "city_id": "gandhinagar",
        "city_name": "Gandhinagar",
        "address": "Sector 10, Gandhinagar, Gujarat 382010",
        "coord": [72.6568, 23.2185],
        "zoom": 15.0,
        "description": "Headquarters of the Government of Gujarat and Chief Minister's Office.",
    },
    {
        "id": "high-court-gujarat",
        "name": "High Court of Gujarat",
        "aliases": ["high court", "gujarat high court", "sola high court"],
        "category": "government",
        "category_label": "Judicial Headquarters",
        "city_id": "ahmedabad",
        "city_name": "Ahmedabad",
        "address": "S.G. Highway, Sola, Ahmedabad, Gujarat 380060",
        "coord": [72.5292, 23.0825],
        "zoom": 15.2,
        "description": "Apex judicial authority for the state of Gujarat situated on S.G. Highway.",
    },

    # Cultural, Recreational & Civic Landmarks
    {
        "id": "narendra-modi-stadium",
        "name": "Narendra Modi Stadium (Motera)",
        "aliases": ["narendra modi stadium", "motera stadium", "motera", "ahmedabad stadium", "cricket stadium"],
        "category": "landmark",
        "category_label": "World's Largest Cricket Stadium",
        "city_id": "ahmedabad",
        "city_name": "Ahmedabad",
        "address": "Motera, Ahmedabad, Gujarat 380005",
        "coord": [72.5972, 23.0917],
        "zoom": 15.2,
        "description": "Largest cricket stadium in the world with 132,000 seating capacity.",
    },
    {
        "id": "science-city-ahmedabad",
        "name": "Gujarat Science City",
        "aliases": ["science city", "science city ahmedabad", "robotics gallery", "aquatic gallery"],
        "category": "landmark",
        "category_label": "Science & Innovation Center",
        "city_id": "ahmedabad",
        "city_name": "Ahmedabad",
        "address": "Science City Rd, Hebatpur, Ahmedabad, Gujarat 380060",
        "coord": [72.4965, 23.0784],
        "zoom": 15.0,
        "description": "Science education and entertainment center featuring Robotics and Aquatic galleries.",
    },
    {
        "id": "sabarmati-ashram",
        "name": "Sabarmati Ashram (Gandhi Ashram)",
        "aliases": ["sabarmati ashram", "gandhi ashram", "hridaya kunj", "dandi march start"],
        "category": "landmark",
        "category_label": "Historical Heritage Site",
        "city_id": "ahmedabad",
        "city_name": "Ahmedabad",
        "address": "Gandhi Smarak Sangrahalaya, Ashram Rd, Ahmedabad 380027",
        "coord": [72.5807, 23.0605],
        "zoom": 15.5,
        "description": "Historic residence of Mahatma Gandhi and headquarters of the Indian independence movement.",
    },
    {
        "id": "sabarmati-riverfront",
        "name": "Sabarmati Riverfront Promenade",
        "aliases": ["sabarmati riverfront", "riverfront", "riverfront park", "atal bridge"],
        "category": "landmark",
        "category_label": "Urban Waterfront",
        "city_id": "ahmedabad",
        "city_name": "Ahmedabad",
        "address": "Sabarmati Riverfront, Ahmedabad, Gujarat 380009",
        "coord": [72.5765, 23.0312],
        "zoom": 14.5,
        "description": "Iconic multi-kilometer urban waterfront promenade along the Sabarmati river.",
    },
    {
        "id": "kankaria-lake",
        "name": "Kankaria Lakefront",
        "aliases": ["kankaria lake", "kankaria", "kankaria lakefront", "naginawadi"],
        "category": "landmark",
        "category_label": "Heritage Lakefront & Zoo",
        "city_id": "ahmedabad",
        "city_name": "Ahmedabad",
        "address": "Maninagar, Ahmedabad, Gujarat 380022",
        "coord": [72.6022, 22.9975],
        "zoom": 15.0,
        "description": "Circular historic lake built in 1451 with Naginawadi island garden and recreation zone.",
    },
    {
        "id": "adalaj-stepwell",
        "name": "Adalaj Stepwell (Rudabai Stepwell)",
        "aliases": ["adalaj stepwell", "adalaj", "adalaj vav", "rudabai stepwell"],
        "category": "landmark",
        "category_label": "15th Century Architectural Heritage",
        "city_id": "gandhinagar",
        "city_name": "Gandhinagar",
        "address": "Adalaj, Gandhinagar, Gujarat 382421",
        "coord": [72.5815, 23.1667],
        "zoom": 15.5,
        "description": "Five-story octagonal stepwell built in 1498 showcasing Solanki architecture.",
    },
    {
        "id": "akshardham-gandhinagar",
        "name": "Akshardham Temple Gandhinagar",
        "aliases": ["akshardham", "akshardham gandhinagar", "swaminarayan akshardham"],
        "category": "landmark",
        "category_label": "Monumental Temple Complex",
        "city_id": "gandhinagar",
        "city_name": "Gandhinagar",
        "address": "Sector 20, J Road, Gandhinagar, Gujarat 382020",
        "coord": [72.6738, 23.2294],
        "zoom": 15.2,
        "description": "Large Hindu temple complex built from pink sandstone in Gandhinagar.",
    },
    {
        "id": "sarkhej-roza",
        "name": "Sarkhej Roza Heritage Complex",
        "aliases": ["sarkhej roza", "sarkhej", "ahmedabad acropolis"],
        "category": "landmark",
        "category_label": "Sufi Monument & Heritage Complex",
        "city_id": "ahmedabad",
        "city_name": "Ahmedabad",
        "address": "Post Jeevraj Park, Sarkhej, Makarba, Ahmedabad 380051",
        "coord": [72.5028, 22.9814],
        "zoom": 15.5,
        "description": "Eminent mosque and tomb complex dubbed the 'Acropolis of Ahmedabad'.",
    },

    # Healthcare & Transit
    {
        "id": "civil-hospital-asarwa",
        "name": "Ahmedabad Civil Hospital, Asarwa",
        "aliases": ["civil hospital", "asarwa civil", "ahmedabad civil hospital", "bj medical college"],
        "category": "hospital",
        "category_label": "Apex Government Healthcare Center",
        "city_id": "ahmedabad",
        "city_name": "Ahmedabad",
        "address": "Haripura, Asarwa, Ahmedabad, Gujarat 380016",
        "coord": [72.6050, 23.0520],
        "zoom": 15.5,
        "description": "One of Asia's largest public hospital complexes with comprehensive super-specialties.",
    },
    {
        "id": "svp-hospital",
        "name": "Sardar Vallabhbhai Patel (SVP) Hospital",
        "aliases": ["svp hospital", "svp", "vs hospital", "paldi svp"],
        "category": "hospital",
        "category_label": "Multi-Specialty Hospital",
        "city_id": "ahmedabad",
        "city_name": "Ahmedabad",
        "address": "Ellisbridge, Paldi, Ahmedabad, Gujarat 380006",
        "coord": [72.5710, 23.0060],
        "zoom": 15.5,
        "description": "Ultra-modern 1500-bed tertiary care public hospital by AMC on the riverfront.",
    },
    {
        "id": "amd-airport",
        "name": "Sardar Vallabhbhai Patel International Airport (AMD)",
        "aliases": ["airport", "ahmedabad airport", "amd airport", "svpia", "hansol airport"],
        "category": "transit",
        "category_label": "International Airport",
        "city_id": "ahmedabad",
        "city_name": "Ahmedabad",
        "address": "Hansol, Ahmedabad, Gujarat 380003",
        "coord": [72.6347, 23.0772],
        "zoom": 14.2,
        "description": "Eighth busiest airport in India serving Ahmedabad and Gandhinagar.",
    },
    {
        "id": "kalupur-railway-station",
        "name": "Ahmedabad Junction Railway Station (Kalupur)",
        "aliases": ["railway station", "kalupur railway station", "ahmedabad station", "bullet train terminus"],
        "category": "transit",
        "category_label": "Central Railway Junction & HSR Terminus",
        "city_id": "ahmedabad",
        "city_name": "Ahmedabad",
        "address": "Kalupur, Ahmedabad, Gujarat 380002",
        "coord": [72.6015, 23.0232],
        "zoom": 15.0,
        "description": "Main railway terminus of Ahmedabad and site of the upcoming High Speed Rail (Bullet Train) hub.",
    },
]


def search_local_landmarks(query: str, limit: int = 8) -> list[dict[str, Any]]:
    """Match query against the curated landmark and institution directory."""
    q = query.lower().strip()
    if not q:
        return []

    # Score matches
    matches: list[tuple[int, dict[str, Any]]] = []
    for item in LANDMARK_DIRECTORY:
        score = 0
        name_lower = item["name"].lower()
        if q in name_lower:
            score += 100
        if any(alias in q or q in alias for alias in item["aliases"]):
            score += 80
        if q in item["address"].lower():
            score += 50
        if q in item["city_name"].lower():
            score += 20
        if q in item["description"].lower():
            score += 30

        # Word overlap
        q_words = set(re.findall(r"\w+", q))
        name_words = set(re.findall(r"\w+", name_lower))
        overlap = len(q_words & name_words)
        score += overlap * 25

        if score > 0:
            matches.append((score, item))

    matches.sort(key=lambda x: -x[0])
    return [m[1] for m in matches[:limit]]


def geocode_osm_fallback(query: str, limit: int = 4) -> list[dict[str, Any]]:
    """Geocode any global/Indian query using OpenStreetMap Nominatim."""
    try:
        clean_q = query.strip()
        encoded = urllib.parse.quote(clean_q)
        url = (
            f"https://nominatim.openstreetmap.org/search?q={encoded}"
            f"&format=json&addressdetails=1&limit={limit}&countrycodes=in"
        )
        req = urllib.request.Request(
            url,
            headers={
                "User-Agent": "UrbanLens-SpatialIntelligence/1.0 (urbanlens-spatial@gujarat.gov.in)",
                "Accept-Language": "en",
            },
        )
        with urllib.request.urlopen(req, timeout=3.5) as resp:
            data = json.loads(resp.read().decode("utf-8"))

        results: list[dict[str, Any]] = []
        for item in data:
            lat = float(item["lat"])
            lng = float(item["lon"])
            name = item.get("display_name", "").split(",")[0]
            display = item.get("display_name", "")
            city_guess = "ahmedabad"
            if "gandhinagar" in display.lower():
                city_guess = "gandhinagar"
            elif "surat" in display.lower():
                city_guess = "surat"
            elif "vadodara" in display.lower():
                city_guess = "vadodara"
            elif "rajkot" in display.lower():
                city_guess = "rajkot"

            results.append({
                "id": f"osm-{item.get('osm_id', hash(display))}",
                "name": name,
                "aliases": [name.lower()],
                "category": item.get("type", "location"),
                "category_label": (item.get("type", "place")).replace("_", " ").title(),
                "city_id": city_guess,
                "city_name": city_guess.title(),
                "address": display,
                "coord": [lng, lat],
                "zoom": 15.0,
                "description": display,
            })
        return results
    except Exception:
        return []


def search_locations(query: str, city_id: str | None = None, limit: int = 10) -> list[dict[str, Any]]:
    """Unified location search combining curated landmarks and live geocoding."""
    curated = search_local_landmarks(query, limit=limit)
    if len(curated) >= 4:
        return curated

    osm = geocode_osm_fallback(query, limit=limit - len(curated))
    seen_coords = {f"{c['coord'][0]:.4f},{c['coord'][1]:.4f}" for c in curated}
    deduped_osm = [o for o in osm if f"{o['coord'][0]:.4f},{o['coord'][1]:.4f}" not in seen_coords]

    return curated + deduped_osm
