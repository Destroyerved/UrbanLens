import { useEffect, useMemo, useState } from "react";
import "./App.css";

import {
  MapContainer,
  TileLayer,
  GeoJSON,
} from "react-leaflet";

const API_BASE = "http://localhost:8000";

const fallbackWards = [
  {
    id: "AMD-01",
    name: "Central Ahmedabad",
    city: "Ahmedabad",
    priority: 91,
    risk: "High",
    population: 182000,
    area: 8.4,
    recommendation:
      "Prioritize drainage and road infrastructure upgrades.",
  },
  {
    id: "AMD-02",
    name: "East Ahmedabad",
    city: "Ahmedabad",
    priority: 84,
    risk: "High",
    population: 164000,
    area: 11.2,
    recommendation:
      "Improve flood resilience and public-service accessibility.",
  },
  {
    id: "AMD-03",
    name: "West Ahmedabad",
    city: "Ahmedabad",
    priority: 68,
    risk: "Medium",
    population: 143000,
    area: 13.8,
    recommendation:
      "Focus on transport connectivity and green infrastructure.",
  },
  {
    id: "GND-01",
    name: "Central Gandhinagar",
    city: "Gandhinagar",
    priority: 61,
    risk: "Medium",
    population: 98000,
    area: 15.4,
    recommendation:
      "Optimize public amenities and mobility access.",
  },
  {
    id: "GND-02",
    name: "North Gandhinagar",
    city: "Gandhinagar",
    priority: 47,
    risk: "Low",
    population: 72000,
    area: 18.7,
    recommendation:
      "Maintain existing infrastructure and monitor growth.",
  },
];

function getPriority(feature) {
  const properties = feature?.properties || {};

  const possibleValues = [
    properties.priority,
    properties.priority_score,
    properties.priorityScore,
    properties.score,
    properties.PRIORITY,
    properties.PRIORITY_SCORE,
  ];

  for (const value of possibleValues) {
    const number = Number(value);

    if (!Number.isNaN(number) && value !== null && value !== "") {
      return number;
    }
  }

  return 50;
}

function getRisk(priority) {
  if (priority >= 75) return "High";
  if (priority >= 50) return "Medium";
  return "Low";
}

function getPriorityColor(priority) {
  if (priority >= 75) return "#ff715d";
  if (priority >= 50) return "#ffb35d";
  return "#5dffae";
}

function getWardStyle(feature) {
  const priority = getPriority(feature);
  const color = getPriorityColor(priority);

  return {
    color,
    weight: 1.5,
    fillColor: color,
    fillOpacity: 0.42,
  };
}

function getWardName(properties) {
  return (
    properties?.name ||
    properties?.ward_name ||
    properties?.WARD_NAME ||
    properties?.ward ||
    properties?.Ward_Name ||
    properties?.NAME ||
    properties?.Name ||
    "Ahmedabad Ward"
  );
}

function getWardId(properties) {
  return (
    properties?.id ||
    properties?.ward_id ||
    properties?.WARD_ID ||
    properties?.WARD_NO ||
    properties?.ward_no ||
    properties?.ward_number ||
    "—"
  );
}

function getPopulation(properties) {
  return (
    properties?.population ||
    properties?.POPULATION ||
    properties?.pop ||
    0
  );
}

function getArea(properties) {
  return (
    properties?.area ||
    properties?.area_km2 ||
    properties?.AREA ||
    0
  );
}

function AhmedabadMap({ geojson, onWardSelect }) {
  if (!geojson) {
    return (
      <div className="map-loading">
        <div>
          <div className="loading-symbol">◉</div>
          <p>Loading Ahmedabad ward boundaries...</p>
        </div>
      </div>
    );
  }

  return (
    <MapContainer
      center={[23.0225, 72.5714]}
      zoom={11}
      scrollWheelZoom={true}
      className="leaflet-map"
    >
      <TileLayer
        attribution="&copy; OpenStreetMap contributors"
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />

      <GeoJSON
        key={JSON.stringify(geojson)}
        data={geojson}
        style={getWardStyle}
        onEachFeature={(feature, layer) => {
          const properties = feature.properties || {};

          const name = getWardName(properties);
          const priority = getPriority(feature);
          const risk = getRisk(priority);

          layer.bindTooltip(
            `${name} · Priority ${Math.round(priority)}`,
            {
              sticky: true,
            }
          );

          layer.on({
            mouseover: (event) => {
              event.target.setStyle({
                weight: 3,
                fillOpacity: 0.65,
              });
            },

            mouseout: (event) => {
              event.target.setStyle(getWardStyle(feature));
            },

            click: () => {
              onWardSelect({
                id: getWardId(properties),
                name,
                city: "Ahmedabad",
                priority,
                risk,
                population: getPopulation(properties),
                area: getArea(properties),
                recommendation:
                  properties?.recommendation ||
                  properties?.RECOMMENDATION ||
                  `This ward has a ${risk.toLowerCase()} priority score of ${Math.round(
                    priority
                  )}. Further infrastructure analysis is recommended.`,
              });
            },
          });
        }}
      />
    </MapContainer>
  );
}

function App() {
  const [wards, setWards] = useState(fallbackWards);
  const [geojson, setGeojson] = useState(null);
  const [selectedWard, setSelectedWard] = useState(null);
  const [city, setCity] = useState("All");
  const [loading, setLoading] = useState(true);
  const [apiOnline, setApiOnline] = useState(false);

  /*
   * Load backend ward data.
   *
   * The app still works without the backend because
   * fallbackWards are available.
   */
  useEffect(() => {
    async function loadWards() {
      try {
        const response = await fetch(`${API_BASE}/wards`);

        if (!response.ok) {
          throw new Error("API unavailable");
        }

        const data = await response.json();

        if (Array.isArray(data) && data.length > 0) {
          setWards(data);
          setApiOnline(true);
        }
      } catch {
        setApiOnline(false);
      } finally {
        setLoading(false);
      }
    }

    loadWards();
  }, []);

  /*
   * Load the REAL Ahmedabad GeoJSON.
   */
  useEffect(() => {
    async function loadGeoJSON() {
      try {
        const response = await fetch(
          "/data/ahmedabad_wards_priority.geojson"
        );

        if (!response.ok) {
          throw new Error("Could not load GeoJSON");
        }

        const data = await response.json();

        if (!data.features) {
          throw new Error(
            "GeoJSON does not contain a features array"
          );
        }

        setGeojson(data);

        console.log(
          "Ahmedabad GeoJSON loaded:",
          data.features.length,
          "features"
        );
      } catch (error) {
        console.error(
          "Ahmedabad GeoJSON loading failed:",
          error
        );
      }
    }

    loadGeoJSON();
  }, []);

  const filteredWards = useMemo(() => {
    if (city === "All") {
      return wards;
    }

    return wards.filter(
      (ward) =>
        (ward.city || "").toLowerCase() ===
        city.toLowerCase()
    );
  }, [wards, city]);

  const stats = useMemo(() => {
    const totalPopulation = filteredWards.reduce(
      (sum, ward) =>
        sum + Number(ward.population || 0),
      0
    );

    const highRisk = filteredWards.filter(
      (ward) =>
        ward.risk === "High" ||
        Number(ward.priority || 0) >= 75
    ).length;

    const averagePriority =
      filteredWards.length > 0
        ? Math.round(
            filteredWards.reduce(
              (sum, ward) =>
                sum + Number(ward.priority || 0),
              0
            ) / filteredWards.length
          )
        : 0;

    return {
      wards: filteredWards.length,
      population: totalPopulation,
      highRisk,
      averagePriority,
    };
  }, [filteredWards]);

  function getPriorityClass(priority) {
    if (priority >= 75) return "high";
    if (priority >= 50) return "medium";
    return "low";
  }

  function formatPopulation(value) {
    const number = Number(value || 0);

    if (number >= 1000000) {
      return `${(number / 1000000).toFixed(1)}M`;
    }

    if (number >= 1000) {
      return `${Math.round(number / 1000)}K`;
    }

    return number.toLocaleString();
  }

  function selectGeoJSONWard(ward) {
    setSelectedWard(ward);

    if (ward.city === "Ahmedabad") {
      setCity("Ahmedabad");
    }
  }

  return (
    <div className="app">
      {/* HEADER */}

      <header className="topbar">
        <div className="brand">
          <div className="brand-mark">U</div>

          <div>
            <div className="brand-name">UrbanLens</div>

            <div className="brand-subtitle">
              Geospatial Intelligence Platform
            </div>
          </div>
        </div>

        <div className="location-pill">
          <span className="location-dot"></span>
          Ahmedabad · Gandhinagar
        </div>

        <div className="system-status">
          <span
            className={`status-dot ${
              apiOnline ? "online" : "offline"
            }`}
          ></span>

          {apiOnline ? "Live data" : "Demo data"}
        </div>
      </header>

      <main className="dashboard">
        {/* HERO */}

        <section className="hero">
          <div>
            <p className="eyebrow">
              URBAN DECISION INTELLIGENCE
            </p>

            <h1>
              See the city.
              <br />
              <span>Understand what it needs.</span>
            </h1>

            <p className="hero-description">
              UrbanLens transforms geospatial data into
              explainable, ward-level infrastructure
              priorities for Ahmedabad and Gandhinagar.
            </p>
          </div>

          <div className="hero-badge">
            <span className="badge-number">01</span>
            <span>Priority Analysis</span>
          </div>
        </section>

        {/* FILTERS */}

        <section className="controls">
          <div className="filter-group">
            <span className="filter-label">
              REGION
            </span>

            <button
              className={
                city === "All"
                  ? "filter active"
                  : "filter"
              }
              onClick={() => setCity("All")}
            >
              All
            </button>

            <button
              className={
                city === "Ahmedabad"
                  ? "filter active"
                  : "filter"
              }
              onClick={() => setCity("Ahmedabad")}
            >
              Ahmedabad
            </button>

            <button
              className={
                city === "Gandhinagar"
                  ? "filter active"
                  : "filter"
              }
              onClick={() => setCity("Gandhinagar")}
            >
              Gandhinagar
            </button>
          </div>

          <div className="data-source">
            <span className="source-icon">
              ◉
            </span>

            OpenStreetMap + Geospatial Analysis
          </div>
        </section>

        {/* STATS */}

        <section className="stats-grid">
          <div className="stat-card">
            <span className="stat-label">
              WARDS ANALYZED
            </span>

            <strong>{stats.wards}</strong>

            <span className="stat-note">
              Spatial units
            </span>
          </div>

          <div className="stat-card">
            <span className="stat-label">
              POPULATION COVERED
            </span>

            <strong>
              {formatPopulation(stats.population)}
            </strong>

            <span className="stat-note">
              Estimated residents
            </span>
          </div>

          <div className="stat-card warning">
            <span className="stat-label">
              HIGH PRIORITY
            </span>

            <strong>{stats.highRisk}</strong>

            <span className="stat-note">
              Require intervention
            </span>
          </div>

          <div className="stat-card">
            <span className="stat-label">
              AVG. PRIORITY SCORE
            </span>

            <strong>
              {stats.averagePriority}
            </strong>

            <span className="stat-note">
              Out of 100
            </span>
          </div>
        </section>

        {/* MAP + INSPECTOR */}

        <section className="workspace">
          <div className="map-panel">
            <div className="panel-header">
              <div>
                <p className="panel-kicker">
                  SPATIAL VIEW
                </p>

                <h2>Ahmedabad Ward Map</h2>
              </div>

              <div className="map-legend">
                <span>
                  <i className="legend high"></i>
                  High
                </span>

                <span>
                  <i className="legend medium"></i>
                  Medium
                </span>

                <span>
                  <i className="legend low"></i>
                  Low
                </span>
              </div>
            </div>

            <div className="map">
              <AhmedabadMap
                geojson={geojson}
                onWardSelect={selectGeoJSONWard}
              />
            </div>
          </div>

          {/* INSPECTOR */}

          <aside className="inspector">
            <div className="panel-header inspector-header">
              <div>
                <p className="panel-kicker">
                  WARD INSPECTOR
                </p>

                <h2>
                  {selectedWard
                    ? selectedWard.name
                    : "Select a ward"}
                </h2>
              </div>
            </div>

            {selectedWard ? (
              <div className="inspector-content">
                <div className="priority-display">
                  <div>
                    <span>PRIORITY SCORE</span>

                    <strong>
                      {Math.round(
                        Number(
                          selectedWard.priority || 0
                        )
                      )}
                    </strong>
                  </div>

                  <div
                    className={`risk-badge ${getPriorityClass(
                      Number(
                        selectedWard.priority || 0
                      )
                    )}`}
                  >
                    {selectedWard.risk ||
                      getRisk(
                        Number(
                          selectedWard.priority || 0
                        )
                      )}
                  </div>
                </div>

                <div className="detail-grid">
                  <div>
                    <span>WARD ID</span>

                    <strong>
                      {selectedWard.id || "—"}
                    </strong>
                  </div>

                  <div>
                    <span>CITY</span>

                    <strong>
                      {selectedWard.city || "—"}
                    </strong>
                  </div>

                  <div>
                    <span>POPULATION</span>

                    <strong>
                      {Number(
                        selectedWard.population || 0
                      ).toLocaleString()}
                    </strong>
                  </div>

                  <div>
                    <span>AREA</span>

                    <strong>
                      {selectedWard.area
                        ? `${selectedWard.area} km²`
                        : "—"}
                    </strong>
                  </div>
                </div>

                <div className="recommendation">
                  <div className="recommendation-title">
                    <span>✦</span>
                    RECOMMENDATION
                  </div>

                  <p>
                    {selectedWard.recommendation ||
                      "Further geospatial analysis is required for this ward."}
                  </p>
                </div>

                <button
                  className="action-button"
                  onClick={() =>
                    alert(
                      `Detailed analysis for ${selectedWard.name} is coming next.`
                    )
                  }
                >
                  View Detailed Analysis

                  <span>→</span>
                </button>
              </div>
            ) : (
              <div className="empty-inspector">
                <div className="empty-icon">
                  ⌖
                </div>

                <h3>Nothing selected</h3>

                <p>
                  Select a ward on the map to inspect
                  its geospatial indicators, priority
                  score and recommended intervention.
                </p>
              </div>
            )}
          </aside>
        </section>

        {/* TABLE */}

        <section className="table-section">
          <div className="table-header">
            <div>
              <p className="panel-kicker">
                ANALYSIS OUTPUT
              </p>

              <h2>Priority Ranking</h2>
            </div>

            <span className="ranking-count">
              {filteredWards.length} areas
            </span>
          </div>

          {loading ? (
            <div className="loading">
              Loading geospatial data...
            </div>
          ) : (
            <div className="table-wrapper">
              <table>
                <thead>
                  <tr>
                    <th>RANK</th>
                    <th>WARD</th>
                    <th>CITY</th>
                    <th>PRIORITY</th>
                    <th>RISK</th>
                    <th>POPULATION</th>
                    <th>
                      RECOMMENDED ACTION
                    </th>
                  </tr>
                </thead>

                <tbody>
                  {[...filteredWards]
                    .sort(
                      (a, b) =>
                        Number(b.priority || 0) -
                        Number(a.priority || 0)
                    )
                    .map((ward, index) => (
                      <tr
                        key={ward.id || index}
                        onClick={() =>
                          setSelectedWard(ward)
                        }
                      >
                        <td className="rank">
                          {String(index + 1).padStart(
                            2,
                            "0"
                          )}
                        </td>

                        <td className="ward-name">
                          {ward.name}
                        </td>

                        <td>{ward.city}</td>

                        <td>
                          <div className="score-cell">
                            <span>
                              {Math.round(
                                Number(
                                  ward.priority || 0
                                )
                              )}
                            </span>

                            <div className="score-bar">
                              <div
                                style={{
                                  width: `${Math.min(
                                    Number(
                                      ward.priority ||
                                        0
                                    ),
                                    100
                                  )}%`,
                                }}
                              ></div>
                            </div>
                          </div>
                        </td>

                        <td>
                          <span
                            className={`risk-text ${getPriorityClass(
                              Number(
                                ward.priority || 0
                              )
                            )}`}
                          >
                            {ward.risk ||
                              getRisk(
                                Number(
                                  ward.priority || 0
                                )
                              )}
                          </span>
                        </td>

                        <td>
                          {Number(
                            ward.population || 0
                          ).toLocaleString()}
                        </td>

                        <td className="recommendation-cell">
                          {ward.recommendation ||
                            "Further analysis required"}
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </main>

      <footer>
        <span>URBANLENS</span>

        <span>
          Geospatial Intelligence · Ahmedabad +
          Gandhinagar
        </span>

        <span>PROTOTYPE v0.1</span>
      </footer>
    </div>
  );
}

export default App;