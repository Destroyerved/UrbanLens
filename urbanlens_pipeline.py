parks = ox.features_from_place(place, tags={"leisure": "park"})
bus_stops = ox.features_from_place(place, tags={"highway": "bus_stop"})
police = ox.features_from_place(place, tags={"amenity": "police"})
fire = ox.features_from_place(place, tags={"amenity": "fire_station"})
from sklearn.preprocessing import MinMaxScaler
scaler = MinMaxScaler()

# Healthcare score: more hospitals + shorter distance = higher score
wards["healthcare_score"] = 100 * (
    0.5 * scaler.fit_transform(wards[["num_hospitals"]]).flatten() +
    0.5 * (1 - scaler.fit_transform(wards[["nearest_hospital_dist"]]).flatten())
)

# Repeat the same pattern for education_score, parks_score, transport_score