\# UrbanLens — Complete Project Handover



You are now acting as the \*\*lead software architect, GIS engineer, backend engineer, ML engineer, and frontend engineer\*\* for this project.



Your job is to help build a working hackathon prototype from this specification.



Do not treat this as a generic dashboard project.



The product must perform \*\*real geospatial analysis\*\*, produce explainable recommendations, and provide an impressive interactive GIS interface.



\---



\# 1. Project Name



\## UrbanLens



Alternative internal name:



\*\*GeoNiti Urban Intelligence\*\*



For now use:



\# UrbanLens



Tagline:



> \*\*AI-Powered Urban Planning \& Land Intelligence Platform\*\*



Core message:



> GLIS tells planners what land exists. UrbanLens helps them understand what is happening there, what is likely to happen next, and what should be built where.



\---



\# 2. Problem Statement



The Government Land Information System — GLIS — contains geospatial information related to:



\* Land parcels

\* Land ownership

\* Boundaries

\* Land classification

\* Land use

\* Government land

\* Administrative boundaries

\* Potential zoning information



The problem is that raw GIS data alone does not automatically help urban planners make decisions.



Urban planners need answers to questions such as:



\* Where is the city expanding?

\* Which areas are likely to urbanize next?

\* Which wards lack hospitals, schools, parks, or public transport?

\* Which government-owned parcels are suitable for development?

\* Which parcel is best for a new hospital?

\* Which areas are becoming overcrowded?

\* Where are zoning violations occurring?

\* Where is agricultural land rapidly converting into built-up land?

\* Which locations would benefit most from a new public facility?

\* What will happen if we build a hospital, metro station, school, or park at a particular location?



UrbanLens transforms GLIS and complementary spatial datasets into \*\*actionable urban-planning intelligence\*\*.



\---



\# 3. Main Goal



Build an urban-planning decision-support system combining:



\* GLIS

\* GIS

\* Satellite imagery

\* Population data

\* Roads

\* Public facilities

\* Environmental data

\* Machine learning

\* Spatial analytics

\* Explainable AI



The system should follow this pipeline:



```text

RAW LAND DATA

&#x20;       ↓

UNDERSTAND CURRENT CITY

&#x20;       ↓

DETECT GAPS \& RISKS

&#x20;       ↓

PREDICT FUTURE GROWTH

&#x20;       ↓

FIND BEST LAND

&#x20;       ↓

SIMULATE INTERVENTIONS

&#x20;       ↓

RECOMMEND ACTION

```



The platform should allow a government planner to:



\*\*SEE → UNDERSTAND → PREDICT → PLAN → SIMULATE → DECIDE\*\*



\---



\# 4. Hackathon Focus



We are focusing primarily on:



\## Urban Planning



Secondary capabilities support urban planning through:



\* Infrastructure analysis

\* Environmental analysis

\* Socio-economic analysis

\* Land management



Do NOT turn these into separate applications.



Everything should exist inside one unified urban-planning platform.



\---



\# 5. Core Product Story



The strongest demonstration should be something like:



> UrbanLens detects that a particular Ahmedabad corridor is experiencing rapid urban growth.



Then:



> The system predicts that this area will continue growing significantly by 2030.



Then:



> Infrastructure analysis shows that the area has poor healthcare coverage.



Then:



> GLIS identifies several government-owned parcels in the region.



Then:



> UrbanLens evaluates those parcels and ranks the best locations for a hospital.



Then:



> The planner selects the recommended parcel.



Then:



> UrbanLens simulates the proposed hospital and shows that healthcare accessibility would improve for thousands of residents.



This complete chain is the core value proposition.



\---



\# 6. Core Modules



The product should contain the following major modules.



\## Module 1 — City Overview



Main command center.



Display KPIs such as:



\* Total GLIS parcels

\* Government-owned parcels

\* Private parcels

\* Vacant government land

\* Built-up area

\* Population

\* Urban growth percentage

\* High-growth zones

\* Infrastructure-deficit wards

\* High-development-potential parcels

\* Zoning conflicts

\* Environmentally sensitive land



Main visualization:



\*\*Interactive city GIS map\*\*



\---



\# 7. Interactive GLIS Map



The map is the heart of the product.



Required functionality:



\* Pan

\* Zoom

\* Parcel selection

\* Layer toggles

\* Search

\* Filter

\* Heatmaps

\* Tooltips

\* Parcel details

\* Ward boundaries

\* Road network

\* Facilities

\* Population

\* Satellite-derived layers



Map layers should include:



\* GLIS parcels

\* Government-owned land

\* Private land

\* Existing land use

\* Zoning

\* Roads

\* Hospitals

\* Schools

\* Parks

\* Public transport

\* Population density

\* Vegetation

\* Water bodies

\* Built-up areas

\* Urban growth

\* Development suitability

\* Infrastructure deficit

\* Environmental risk



\---



\# 8. Parcel Intelligence Profile



Clicking a parcel must open a detailed panel.



Example:



```text

Parcel ID

GJ-AHD-001982



Area

18.4 acres



Ownership

Government



Official Zone

Residential



Current Land Use

Vacant / Mixed



Built-up

12%



Vegetation

31%



Road Distance

420 meters



Nearest Hospital

4.8 km



Nearest School

1.2 km



Population within 3 km

42,600



Flood Risk

Low



Accessibility

91/100



Infrastructure Readiness

78/100



Environmental Suitability

86/100



Development Potential

92/100

```



Recommended use:



```text

1\. Public Hospital       94

2\. Residential Housing   89

3\. School                83

4\. Public Park           76

```



\---



\# 9. Urban Growth Analysis



Analyze historical urban expansion.



Potential years:



\* 2018

\* 2022

\* 2026



Use satellite imagery and/or historical built-up datasets.



Calculate:



\* Built-up change

\* Vegetation loss

\* Agricultural conversion

\* New development

\* Urban expansion direction

\* Growth corridors



Example output:



```text

Built-Up Area



2018    321 km²

2022    378 km²

2026    426 km²



2018 → 2026 Growth

+32.7%

```



\---



\# 10. Urban Time Machine



Provide a map timeline.



Example:



```text

2018 ───── 2020 ───── 2022 ───── 2024 ───── 2026

&#x20;                                     ●

```



Changing the year should update relevant layers.



The planner should visually observe urban expansion.



Important transformations to identify:



```text

Agriculture → Residential



Vacant → Built-Up



Vegetation → Built-Up



Industrial → Mixed Use

```



\---



\# 11. Urban Growth Prediction



Predict likely future urban expansion.



Example target:



\## 2030 Urban Growth Probability



Each grid cell or region receives:



```text

0–20%     Very Low

20–40%    Low

40–60%    Medium

60–80%    High

80–100%   Very High

```



Potential model inputs:



\* Distance to major roads

\* Distance to existing built-up area

\* Current land use

\* Population density

\* Historical growth

\* Distance from city center

\* Existing infrastructure

\* Transportation connectivity

\* Parcel availability

\* Zoning

\* Terrain

\* Environmental constraints



For the hackathon MVP, prioritize explainability over unnecessarily complex deep learning.



Potential algorithms:



\* XGBoost

\* Random Forest

\* Logistic regression baseline



Only use neural networks if there is enough time and useful training data.



\---



\# 12. Urban Expansion Corridors



Automatically identify major directions of urban expansion.



Examples:



```text

North-West Corridor

Growth Risk: Very High



SP Ring Road South

Growth Risk: High



Eastern Industrial Corridor

Growth Risk: High

```



For each corridor show:



\* Historical growth

\* Predicted growth

\* Population

\* Infrastructure capacity

\* Development opportunities

\* Risks



\---



\# 13. Infrastructure Gap Analysis



This is one of the key features.



Analyze whether areas have sufficient access to:



\* Hospitals

\* Clinics

\* Schools

\* Universities

\* Parks

\* Fire stations

\* Police stations

\* Public transport

\* Roads

\* Government services



Example:



```text

Ward 17



Population

92,430



Healthcare

32/100 — Critical



Education

71/100 — Moderate



Parks

28/100 — Critical



Transportation

54/100 — Poor



Road Connectivity

82/100 — Good

```



Generate:



\## Infrastructure Deficit Heatmap



Areas with large populations and low facility coverage should appear as high-priority intervention zones.



\---



\# 14. 15-Minute City Analyzer



Analyze whether important services are accessible within approximately 15 minutes.



Facilities:



\* Hospital

\* Clinic

\* School

\* Park

\* Bus stop

\* Metro

\* Market

\* Government office



Example:



```text

Hospital       12 min    ✓

School          8 min    ✓

Park           22 min    ✕

Bus Stop        5 min    ✓

Govt Office    19 min    ✕

```



Calculate a:



\# 15-Minute Accessibility Score



This can operate at:



\* Parcel level

\* Grid level

\* Neighborhood level

\* Ward level



\---



\# 15. Urban Livability Score



Generate a score for neighborhoods.



Potential components:



```text

Healthcare

Education

Green Space

Transportation

Public Services

Road Connectivity

Environmental Quality

Accessibility

```



Example:



```text

Healthcare         81

Education          92

Transportation     73

Green Space        38

Public Services    67



Urban Livability Score



70 / 100

```



\---



\# 16. Smart Site Selection



One of the most important modules.



Planner selects:



```text

Plan New Infrastructure

```



Options:



\* Hospital

\* School

\* Park

\* Fire station

\* Government office

\* Residential development

\* Affordable housing

\* Commercial zone

\* Industrial zone

\* Mixed-use development



Then specify requirements.



Example:



```text

Project

Hospital



Minimum Land

5 hectares



Government Land

Preferred



Road Distance

< 2 km



Population Need

High



Flood Risk

Low



Environmental Sensitivity

Low



Public Transport

Preferred

```



UrbanLens evaluates eligible parcels.



\---



\# 17. Parcel Ranking



Output:



```text

BEST SITES FOR NEW HOSPITAL



\#1 GJ-AHD-1028

Score 94/100



\#2 GJ-AHD-3882

Score 90/100



\#3 GJ-AHD-8291

Score 87/100

```



Click each result to locate it on the map.



\---



\# 18. Urban Development Suitability Score



Create an explainable weighted scoring engine.



Initial example formula:



```text

UDS =

0.25 Accessibility

\+

0.20 Population Need

\+

0.15 Transit

\+

0.15 Infrastructure

\+

0.15 Environmental Suitability

\+

0.10 Land Compatibility

```



Each individual factor should be normalized between:



```text

0–100

```



Example:



```text

Accessibility           94

Population Need         88

Transit                 91

Infrastructure          78

Environment             86

Land Compatibility      97



Final Score

90 / 100

```



\---



\# 19. Customizable Planning Weights



Very important.



Users must be able to change weights.



Example UI:



```text

Accessibility

25%



Population Need

20%



Environment

30%



Infrastructure

15%



Land Compatibility

10%

```



Changing sliders should recalculate results.



This demonstrates explainable decision support instead of black-box AI.



\---



\# 20. Explainable Site Recommendations



Every recommendation should explain itself.



Example:



```text

WHY THIS SITE RANKED #1



✓ Government-owned land

✓ 1.1 km from arterial road

✓ Serves 48,000 underserved residents

✓ Low flood exposure

✓ Existing electricity infrastructure nearby

✓ Low ecological sensitivity



Potential Issues



⚠ 2.4 km from nearest bus route

⚠ Limited existing drainage infrastructure

```



\---



\# 21. Zoning Conflict Detection



Compare:



```text

Official GLIS / planning designation

```



against:



```text

Detected current land use

```



Examples:



```text

Official:

Agricultural



Detected:

Built-Up / Residential



Potential zoning conflict

```



or:



```text

Official:

Residential



Detected:

Industrial / Warehouse



Potential land-use mismatch

```



Display conflicts on the map.



\---



\# 22. Land-Use Change Detection



Detect transitions between years.



Important categories:



\* Built-up

\* Agriculture

\* Vegetation

\* Water

\* Open land



Example:



```text

Parcel GJ-7812



2022

Agriculture 82%



2026

Agriculture 31%

Built-Up 56%



Detected Transition



Agricultural → Built-Up

```



\---



\# 23. Vacant Government Land Finder



Create a special view showing:



```text

Government Owned

\+

Low Built-Up

\+

Low Environmental Risk

\+

Good Accessibility

```



These become development opportunity parcels.



\---



\# 24. Government Land Opportunity Score



For each government parcel calculate:



```text

Development Potential

Accessibility

Social Need

Infrastructure Readiness

Environmental Suitability

Strategic Location

```



Produce:



\# Land Opportunity Score



Example:



```text

Opportunity Score



92 / 100

```



\---



\# 25. Environmental Constraints



Before recommending development, check:



\* Water bodies

\* Flood-sensitive areas

\* Forest/vegetation

\* Environmentally sensitive zones

\* Drainage

\* Elevation

\* Slope



Example:



```text

Environmental Risk



LOW



✓ Outside flood zone

✓ No water-body overlap

✓ Low ecological sensitivity

⚠ 8% vegetation coverage

```



\---



\# 26. What-If Urban Planning Simulator



This is a major differentiator.



Planner clicks:



```text

SIMULATE DEVELOPMENT

```



Select:



\* Hospital

\* School

\* Metro station

\* Bus station

\* Park

\* Road

\* Government facility



Place proposed infrastructure on map.



System calculates expected impact.



Example:



```text

PROPOSED HOSPITAL



Healthcare Coverage



Before

64%



After

88%



Residents Newly Covered

46,800



Average Hospital Distance



Before

5.8 km



After

2.9 km

```



\---



\# 27. Before vs After Analysis



Display side-by-side impact.



Example:



```text

&#x20;            BEFORE     AFTER



Accessibility    61        79

Healthcare       54        87

Livability       68        76

Population

Covered        38K       84K

```



The user should visually understand the policy impact.



\---



\# 28. AI Urban Planning Copilot



Provide an AI assistant.



Example questions:



> Find government land larger than 5 hectares near high-density residential areas.



> Where should Ahmedabad build a new hospital?



> Which wards may face infrastructure stress by 2030?



> Show areas with high population but poor access to parks.



> Which government parcels have the highest development potential?



> Why was parcel GJ-AHD-1028 ranked first?



> Show rapid agricultural-to-residential conversion.



The AI should NOT invent spatial answers.



\---



\# 29. Critical AI Architecture Rule



The LLM should never independently calculate geospatial results.



Correct architecture:



```text

USER

&#x20;↓

LLM

interprets intent

&#x20;↓

TOOL / FUNCTION

&#x20;↓

POSTGIS / PYTHON GIS ENGINE

&#x20;↓

REAL ANALYSIS

&#x20;↓

STRUCTURED RESULT

&#x20;↓

LLM

explains result

```



The LLM is responsible for:



\* Natural-language understanding

\* Tool selection

\* Explanation

\* Summaries



GIS/ML systems are responsible for:



\* Spatial filtering

\* Distances

\* Intersections

\* Scores

\* Statistics

\* Predictions



\---



\# 30. Data Sources



\## Primary



\### GLIS



This should be considered authoritative.



Expected fields:



```text

parcel\_id

survey\_number

geometry

area

ownership

land\_use

zoning

district

ward

administrative\_boundary

government\_private

```



If real GLIS data is unavailable during development:



Create realistic demo data.



BUT:



Do not pretend synthetic data is official.



Clearly label demo/mock datasets where applicable.



\---



\# 31. Satellite Data



Use:



\## Sentinel-2



Purpose:



\* Urban growth

\* Built-up detection

\* Vegetation

\* Water

\* Land-use change



Potential indices:



\### NDVI



```text

(NIR - RED)

\-----------

(NIR + RED)

```



Vegetation.



\### NDBI



```text

(SWIR - NIR)

\------------

(SWIR + NIR)

```



Built-up.



\### NDWI



```text

(GREEN - NIR)

\-------------

(GREEN + NIR)

```



Water.



\---



\# 32. Indian Geospatial Data



Use:



\## ISRO Bhuvan



Potential layers:



\* Land Use / Land Cover

\* Urban land use

\* Water bodies

\* Flood information

\* Wasteland

\* Urban sprawl

\* Environmental layers



\---



\# 33. Roads and POIs



Use:



\# OpenStreetMap



Fetch:



\* Roads

\* Hospitals

\* Clinics

\* Schools

\* Colleges

\* Parks

\* Bus stops

\* Metro

\* Police

\* Fire stations

\* Government offices



Potential extraction through:



\* Overpass API

\* Geofabrik downloads



\---



\# 34. Population



Use:



\## Census of India



For:



\* Demographics

\* Ward population

\* Socio-economic indicators



Also use:



\## WorldPop



For high-resolution population grids.



\---



\# 35. Historical Built-Up Data



Use:



\## GHSL



Global Human Settlement Layer.



Use for:



\* Historical built-up

\* Settlement development

\* Urbanization trends



\---



\# 36. Elevation



Use:



\## Copernicus DEM



Purpose:



\* Terrain

\* Elevation

\* Slope

\* Basic flood susceptibility

\* Construction suitability



\---



\# 37. Ahmedabad Planning Data



If Ahmedabad is our demonstration city, use relevant:



\## AUDA



datasets/maps where publicly accessible.



Potential information:



\* Development plans

\* Zoning

\* Town-planning schemes

\* Development boundaries

\* Major roads

\* Reserved areas



\---



\# 38. Initial Demo City



Use:



\# Ahmedabad, Gujarat



Reasons:



\* Large and rapidly growing city

\* Relevant urban-expansion challenges

\* Good demonstration environment

\* AUDA planning context

\* Familiar geographical context



Build architecture so other cities can be loaded later.



Do NOT hard-code the whole application specifically to Ahmedabad.



\---



\# 39. Technology Stack



\## Frontend



```text

Next.js

TypeScript

React

Tailwind CSS

shadcn/ui

```



\---



\# 40. Mapping



Primary:



```text

MapLibre GL JS

```



Additional large-data visualization:



```text

deck.gl

```



Optional 3D mode:



```text

CesiumJS

```



Do not make Cesium mandatory for MVP.



2D GIS functionality is more important than decorative 3D.



\---



\# 41. Backend



```text

Python

FastAPI

Pydantic

SQLAlchemy

```



\---



\# 42. Database



Use:



\# PostgreSQL + PostGIS



This is mandatory for serious spatial functionality.



Important functions:



```text

ST\_Intersects

ST\_Within

ST\_Contains

ST\_Distance

ST\_DWithin

ST\_Area

ST\_Buffer

ST\_Centroid

ST\_Intersection

ST\_Union

ST\_Transform

```



\---



\# 43. GIS Processing



Use:



```text

GeoPandas

Shapely

Rasterio

GDAL

pyproj

```



\---



\# 44. Machine Learning



Use:



```text

scikit-learn

XGBoost

```



Optional:



```text

PyTorch

```



Only use PyTorch where required for real satellite segmentation.



\---



\# 45. Routing



For actual travel-time accessibility, preferred options:



```text

OSRM

GraphHopper

OpenRouteService

```



For initial prototype, network-distance or drive-time approximations may be used.



\---



\# 46. File Storage



Potential:



```text

Cloudflare R2

Supabase Storage

S3-compatible storage

```



For:



\* GeoTIFF

\* Satellite imagery

\* Generated reports

\* Large spatial files



\---



\# 47. Deployment



Frontend:



```text

Vercel

```



Database:



```text

Supabase PostgreSQL + PostGIS

```



Backend:



```text

Railway

or

Google Cloud Run

```



Large object storage:



```text

Cloudflare R2

```



\---



\# 48. Database Schema



Start with approximately the following schema.



\## parcels



```text

id

parcel\_id

survey\_number

geometry

area\_sqm

ownership\_type

owner\_category

land\_use

zoning

district

ward

built\_up\_percent

vegetation\_percent

created\_at

updated\_at

```



Geometry:



```text

MULTIPOLYGON

SRID 4326

```



\---



\# 49. wards



```text

id

name

ward\_code

geometry

population

population\_density

livability\_score

infrastructure\_score

growth\_score

```



\---



\# 50. facilities



```text

id

name

facility\_type

geometry

source

capacity

metadata

```



Facility types:



```text

hospital

clinic

school

college

park

fire\_station

police\_station

bus\_stop

metro\_station

government\_office

```



\---



\# 51. roads



```text

id

osm\_id

road\_type

name

geometry

max\_speed

importance

```



\---



\# 52. land\_use\_history



```text

id

parcel\_id

year

built\_up\_percent

vegetation\_percent

agriculture\_percent

water\_percent

open\_land\_percent

source

```



\---



\# 53. suitability\_scores



```text

id

parcel\_id

project\_type

accessibility\_score

population\_need\_score

transit\_score

infrastructure\_score

environment\_score

land\_score

final\_score

calculated\_at

```



\---



\# 54. predictions



```text

id

geometry

prediction\_year

growth\_probability

risk\_category

model\_version

```



\---



\# 55. planning\_scenarios



```text

id

name

scenario\_type

geometry

parameters\_json

baseline\_json

result\_json

created\_at

```



\---



\# 56. API Structure



Create approximately:



```text

/api/parcels

/api/parcels/{id}



/api/wards

/api/wards/{id}



/api/facilities



/api/layers



/api/growth/history

/api/growth/prediction



/api/suitability/calculate

/api/suitability/search



/api/infrastructure/gaps



/api/accessibility/analyze



/api/livability



/api/zoning/conflicts



/api/scenarios/simulate



/api/copilot/query

```



\---



\# 57. Example Parcel API



```json

{

&#x20; "parcel\_id": "GJ-AHD-00182",

&#x20; "area\_acres": 12.8,

&#x20; "ownership": "Government",

&#x20; "zoning": "Residential",

&#x20; "land\_use": "Vacant",

&#x20; "scores": {

&#x20;   "accessibility": 91,

&#x20;   "infrastructure": 78,

&#x20;   "environment": 86,

&#x20;   "development": 92

&#x20; }

}

```



\---



\# 58. Example Site Search



Request:



```json

{

&#x20; "project\_type": "hospital",

&#x20; "minimum\_area\_hectares": 5,

&#x20; "government\_land": true,

&#x20; "max\_road\_distance\_km": 2,

&#x20; "low\_flood\_risk": true

}

```



Response:



```json

\[

&#x20; {

&#x20;   "parcel\_id": "G1028",

&#x20;   "score": 94

&#x20; },

&#x20; {

&#x20;   "parcel\_id": "G3882",

&#x20;   "score": 90

&#x20; }

]

```



\---



\# 59. Frontend Layout



Main navigation:



```text

Overview

Urban Growth

Infrastructure

Land Intelligence

Site Selection

Simulator

AI Copilot

```



\---



\# 60. Overview Page



Layout concept:



```text

\--------------------------------------------------

&#x20;UrbanLens                       Ahmedabad ▼

\--------------------------------------------------



&#x20;Population     Govt Land     Growth     Deficit

&#x20;8.4M           1,284 ha      +12.4%     12 wards



\--------------------------------------------------



&#x20;              INTERACTIVE MAP



\--------------------------------------------------



&#x20;Growth Hotspots       Infrastructure Gaps



&#x20;Opportunity Land      Planning Alerts

```



\---



\# 61. Urban Growth Page



Include:



\* Timeline slider

\* Satellite comparison

\* Built-up charts

\* Growth heatmap

\* Predicted 2030 layer

\* Growth corridor cards



\---



\# 62. Infrastructure Page



Include:



\* Facility filters

\* Coverage heatmap

\* Underserved wards

\* Population affected

\* 15-minute-city analysis

\* Infrastructure deficit ranking



\---



\# 63. Land Intelligence Page



Include:



\* Parcel search

\* Government land

\* Vacant land

\* Parcel score

\* Land-use history

\* Development potential

\* Environmental constraints



\---



\# 64. Site Selection Page



Workflow:



```text

Select project

&#x20;      ↓

Set constraints

&#x20;      ↓

Configure weights

&#x20;      ↓

Run analysis

&#x20;      ↓

Rank parcels

&#x20;      ↓

Compare candidates

&#x20;      ↓

Open parcel

```



\---



\# 65. Simulator Page



Workflow:



```text

Choose intervention

&#x20;      ↓

Place on map

&#x20;      ↓

Set capacity

&#x20;      ↓

Run simulation

&#x20;      ↓

Compare before vs after

```



\---



\# 66. AI Copilot UI



Prefer a split layout:



```text

MAP                  AI COPILOT



&#x20;                    "Find underserved

&#x20;                    areas near govt land."



&#x20;                    6 areas found.



&#x20;                    \[Show Results]

```



AI responses should be able to trigger map actions.



For example:



```text

zoom\_to\_area

highlight\_parcels

enable\_layer

compare\_parcels

```



\---



\# 67. Visual Design



Design style:



\* Dark modern GIS dashboard

\* Premium government intelligence platform

\* Clean

\* Data-heavy but not cluttered

\* Strong typography

\* Map-first

\* Minimal unnecessary gradients

\* Professional rather than gaming-like



Think:



```text

Palantir

\+

ArcGIS

\+

modern SaaS dashboard

\+

urban command center

```



Colors should communicate meaning.



For example:



```text

Green

Good / Suitable



Yellow

Moderate



Orange

Warning



Red

Critical



Blue

Government / Infrastructure

```



\---



\# 68. MVP Priorities



Do NOT attempt all features immediately.



\## Priority 1



Interactive Map.



Must work first.



\---



\## Priority 2



GLIS parcel visualization.



\---



\## Priority 3



Parcel Intelligence panel.



\---



\## Priority 4



OSM roads/facilities.



\---



\## Priority 5



Population heatmap.



\---



\## Priority 6



Infrastructure gap analysis.



\---



\## Priority 7



Site suitability engine.



\---



\## Priority 8



Ranked parcel recommendations.



\---



\## Priority 9



Historical urban growth.



\---



\## Priority 10



2030 growth prediction.



\---



\## Priority 11



What-if simulator.



\---



\## Priority 12



AI Copilot.



\---



\# 69. Minimum Hackathon MVP



The MVP MUST demonstrate these six features extremely well:



\## 1. Interactive GLIS Map



\## 2. Urban Growth Analysis + Prediction



\## 3. Infrastructure Gap Analysis



\## 4. Smart Site Selection



\## 5. What-If Planning Simulator



\## 6. AI Urban Planning Copilot



Everything else is secondary.



\---



\# 70. Important Engineering Principle



Do not create fake buttons.



Every major visible feature in the final demo should perform something.



Avoid:



\* Placeholder charts

\* Buttons that do nothing

\* Hard-coded AI answers

\* Fake GIS calculations

\* Completely random scores



Mock datasets are acceptable.



Fake analytics are not.



Scores should come from deterministic formulas or models.



\---



\# 71. Development Strategy



Build the application in vertical slices.



For example:



\### Slice 1



```text

Database

→ parcels

→ API

→ map

→ parcel click

→ parcel details

```



Complete that before moving on.



\### Slice 2



```text

facilities

→ API

→ map

→ distance analysis

→ facility coverage

```



\### Slice 3



```text

population

→ raster/grid

→ API

→ heatmap

→ underserved analysis

```



\### Slice 4



```text

suitability engine

→ score parcels

→ rank

→ map

→ explanation

```



This approach is preferable to building all frontend pages before backend functionality.



\---



\# 72. Suggested Repository Structure



```text

urbanlens/

│

├── apps/

│   └── web/

│

├── backend/

│   ├── app/

│   │   ├── api/

│   │   ├── models/

│   │   ├── schemas/

│   │   ├── services/

│   │   ├── gis/

│   │   ├── ml/

│   │   └── main.py

│   │

│   ├── tests/

│   └── requirements.txt

│

├── data/

│   ├── raw/

│   ├── processed/

│   └── demo/

│

├── notebooks/

│   ├── urban\_growth.ipynb

│   ├── suitability.ipynb

│   └── satellite\_analysis.ipynb

│

├── scripts/

│   ├── import\_osm.py

│   ├── import\_glis.py

│   ├── process\_satellite.py

│   └── seed\_demo.py

│

├── docs/

│   ├── architecture.md

│   ├── data-sources.md

│   └── methodology.md

│

└── README.md

```



\---



\# 73. Development Phases



\## Phase 1 — Foundation



Create:



\* Next.js

\* FastAPI

\* PostgreSQL/PostGIS

\* Environment configuration

\* MapLibre



\---



\## Phase 2 — Map



Load:



\* Ahmedabad boundary

\* Ward boundaries

\* GLIS/demo parcels

\* OSM roads

\* Facilities



\---



\## Phase 3 — Parcel Intelligence



Implement:



\* Parcel details

\* Spatial metadata

\* Nearby facilities

\* Population calculations

\* Accessibility



\---



\## Phase 4 — Infrastructure



Implement:



\* Coverage

\* Gap analysis

\* Underserved population



\---



\## Phase 5 — Suitability



Implement:



\* Filtering

\* Weighted score

\* Ranking

\* Explanation



\---



\## Phase 6 — Satellite



Implement:



\* Historical imagery

\* Land use

\* Built-up change



\---



\## Phase 7 — Prediction



Implement:



\* Growth model

\* Prediction grid

\* Heatmap



\---



\## Phase 8 — Simulator



Implement:



\* Proposed facility

\* Catchment calculation

\* Before/after metrics



\---



\## Phase 9 — Copilot



Expose GIS functions as tools.



Connect them to the LLM.



\---



\## Phase 10 — Demo Polish



Improve:



\* Animations

\* Loading states

\* Map transitions

\* Charts

\* Storytelling

\* Demo dataset



\---



\# 74. Hackathon Demo Scenario



This scenario should be supported end-to-end.



\### Step 1



Open Ahmedabad.



Show:



```text

UrbanLens

Ahmedabad Urban Intelligence

```



\---



\### Step 2



Enable:



```text

Urban Growth

```



Show:



```text

2018 → 2026

```



Explain:



> This corridor has seen rapid urban expansion.



\---



\### Step 3



Enable:



```text

2030 Prediction

```



Explain:



> The model predicts continued expansion in this region.



\---



\### Step 4



Open infrastructure analysis.



Show:



> Healthcare coverage is insufficient.



\---



\### Step 5



Display population heatmap.



Explain:



> Approximately 50,000 residents have poor healthcare accessibility.



\---



\### Step 6



Ask:



> Where should a new public hospital be built?



\---



\### Step 7



Suitability engine checks:



```text

Government ownership

Land area

Road access

Population

Environment

Existing healthcare

```



\---



\### Step 8



Display:



```text

Top Site



Parcel GJ-AHD-1028

94/100

```



\---



\### Step 9



Explain recommendation.



```text

✓ Government land

✓ 48,000 underserved residents nearby

✓ Strong road connectivity

✓ Low flood risk

✓ Suitable parcel size

```



\---



\### Step 10



Click:



```text

Simulate Hospital

```



\---



\### Step 11



Show:



```text

Healthcare Coverage



Before

64%



After

88%



New Residents Covered

46,800

```



\---



\### Step 12



Ask AI:



> Why is this the best location?



AI explains using actual metrics.



That completes the story.



\---



\# 75. What Makes This Different



We are NOT building:



> A map dashboard.



We ARE building:



> A city-scale spatial decision-support system.



We are NOT building:



> A chatbot over GIS data.



We ARE building:



> A GIS analytics engine controlled through natural language.



We are NOT simply visualizing GLIS.



We are turning GLIS into:



```text

OBSERVATION

\+

ANALYSIS

\+

PREDICTION

\+

RECOMMENDATION

\+

SIMULATION

```



\---



\# 76. Final One-Line Pitch



> \*\*UrbanLens transforms GLIS, satellite imagery, population data and city infrastructure into an AI-powered urban planning intelligence system that predicts city growth, identifies infrastructure gaps, recommends optimal development sites and simulates the impact of planning decisions before they are implemented.\*\*



\---



\# 77. Shorter Pitch



> \*\*UrbanLens helps governments answer one question: What should we build, where should we build it, and why?\*\*



\---



\# 78. Technical Pitch



> UrbanLens combines PostGIS-based spatial analytics, satellite-derived urban change detection, ML-based growth prediction, multi-criteria land suitability analysis and an explainable AI copilot within an interactive city-scale GIS platform.



\---



\# 79. Primary Innovation



The main innovation is connecting:



```text

GLIS LAND RECORDS

&#x20;       +

SATELLITE OBSERVATION

&#x20;       +

POPULATION NEED

&#x20;       +

INFRASTRUCTURE

&#x20;       +

PREDICTIVE ANALYTICS

&#x20;       ↓

PLANNING RECOMMENDATION

&#x20;       ↓

WHAT-IF SIMULATION

```



Most GIS systems explain what exists.



UrbanLens should explain:



> What exists?



> What changed?



> What is missing?



> What will happen?



> What should be done?



> What happens if we do it?



\---



\# 80. Claude's Role Going Forward



Whenever asked to implement something:



1\. Preserve this architecture.

2\. Do not unnecessarily change the tech stack.

3\. Prefer working implementations over mockups.

4\. Keep geospatial calculations server-side.

5\. Use PostGIS wherever spatial database operations make sense.

6\. Keep ML explainable.

7\. Keep frontend map-first.

8\. Do not allow the LLM to invent analytics.

9\. Keep individual modules loosely coupled.

10\. Maintain Ahmedabad as the initial demo area while keeping architecture reusable.

11\. Use realistic demo data if official GLIS data has not yet been provided.

12\. Clearly separate real, public, and synthetic data.

13\. Prioritize the hackathon demo flow above everything else.



When generating code, produce production-structured code rather than isolated snippets wherever possible.



When making architectural decisions, optimize for:



```text

Hackathon development speed

\+

Real functionality

\+

Demo reliability

\+

Technical credibility

\+

Future scalability

```



The immediate goal is not to build the entire smart-city ecosystem.



The immediate goal is to deliver one exceptionally convincing urban-planning workflow:



\# Detect Growth → Find Infrastructure Gap → Identify Land → Recommend Site → Simulate Impact → Explain Decision



