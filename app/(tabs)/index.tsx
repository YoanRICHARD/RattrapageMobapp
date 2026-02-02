import React, { useState } from "react";
import {
  View,
  Text,
  TextInput,
  FlatList,
  StyleSheet,
  ActivityIndicator,
  Alert,
  TouchableOpacity,
  Modal,
} from "react-native";
import axios from "axios";
import * as Location from "expo-location";
import MapView, { Marker } from "react-native-maps";

// Calcul distance entre deux points (km)
function getDistanceFromLatLonInKm(lat1: number, lon1: number, lat2: number, lon2: number) {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

export default function HomeScreen() {
  const [streetName, setStreetName] = useState("");
  const [cities, setCities] = useState<
    { name: string; distance?: number; lat: number; lon: number }[]
  >([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mapVisible, setMapVisible] = useState(false);

  async function getUserLocation() {
    try {
      const permission = await Location.requestForegroundPermissionsAsync();
      if (permission.status !== "granted") return null;
      const pos = await Location.getCurrentPositionAsync({});
      return { latitude: pos.coords.latitude, longitude: pos.coords.longitude };
    } catch {
      return null;
    }
  }

  async function searchStreet(useLocation: boolean, showMap = false) {
    const value = streetName.trim();
    if (!value) {
      Alert.alert("Input required", "Entrez un nom de rue.");
      return;
    }

    setLoading(true);
    setError(null);
    setCities([]);
    setMapVisible(false);

    try {
      let location: { latitude: number; longitude: number } | null = null;
      if (useLocation || showMap) location = await getUserLocation();

      const response = await axios.get("https://data.geopf.fr/geocodage/search", {
        params: {
          q: `rue ${value}`,
          index: "address",
          limit: 50,
          type: "street",
          lat: location?.latitude,
          lon: location?.longitude,
        },
      });

      const features = response.data.features || [];

      let results = features
        .filter(
          (f: any) =>
            f.properties?.type === "street" &&
            f.properties?.name?.toLowerCase() === `rue ${value.toLowerCase()}`
        )
        .map((f: any) => {
          const city = f.properties.city;
          const [lon, lat] = f.geometry.coordinates;
          if (location) {
            const distance = getDistanceFromLatLonInKm(location.latitude, location.longitude, lat, lon);
            return { name: city, distance, lat, lon };
          }
          return { name: city, lat, lon };
        })
        .filter((item) => item.name);

      const uniqueResults: { [key: string]: { name: string; distance?: number; lat: number; lon: number } } = {};
      results.forEach((r) => {
        if (!uniqueResults[r.name]) uniqueResults[r.name] = r;
        else if (r.distance && (!uniqueResults[r.name].distance || r.distance < uniqueResults[r.name].distance)) {
          uniqueResults[r.name].distance = r.distance;
        }
      });

      results = Object.values(uniqueResults);

      if (useLocation) results.sort((a, b) => (a.distance || 0) - (b.distance || 0));

      if (results.length === 0) setError(`Aucune "rue ${value}" n'a été trouvé.`);

      setCities(results);

      if (showMap && results.length > 0) setMapVisible(true);
    } catch (err) {
      console.error(err);
      setError("Une erreur a eu lieu.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>IGN Street Search</Text>

      <TextInput
        style={styles.input}
        placeholder="Entrez un nom de rue (ex: Victor Hugo)"
        value={streetName}
        onChangeText={setStreetName}
      />

      <View style={styles.buttonRow}>
        <TouchableOpacity style={styles.button} onPress={() => searchStreet(false)}>
          <Text style={styles.buttonText}>Rechercher</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.button} onPress={() => searchStreet(true)}>
          <Text style={styles.buttonText}>Rechercher par distance</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.button} onPress={() => searchStreet(false, true)}>
          <Text style={styles.buttonText}>Rechercher avec carte</Text>
        </TouchableOpacity>
      </View>

      {loading && <ActivityIndicator style={styles.loading} size="large" color="#4A90E2" />}
      {error && <Text style={styles.error}>{error}</Text>}

      {/* Carte plein écran dans un modal */}
      <Modal visible={mapVisible} animationType="slide">
        <View style={styles.mapContainer}>
          <MapView
            style={styles.map}
            initialRegion={{
              latitude: cities[0]?.lat,
              longitude: cities[0]?.lon,
              latitudeDelta: 2,
              longitudeDelta: 2,
            }}
          >
            {cities.map((c, index) => (
              <Marker
                key={index}
                coordinate={{ latitude: c.lat, longitude: c.lon }}
                title={c.name}
                description={c.distance ? `${c.distance.toFixed(1)} km` : undefined}
              />
            ))}
          </MapView>

          {/* Liste flottante sur la carte */}
          <View style={styles.overlayList}>
            <FlatList
              data={cities}
              keyExtractor={(item, index) => index.toString()}
              renderItem={({ item }) => (
                <View style={styles.cityContainer}>
                  <Text style={styles.cityName}>{item.name}</Text>
                  {item.distance !== undefined && (
                    <Text style={styles.cityDistance}>{item.distance.toFixed(1)} km</Text>
                  )}
                </View>
              )}
            />
          </View>

          <TouchableOpacity style={styles.closeButton} onPress={() => setMapVisible(false)}>
            <Text style={styles.closeButtonText}>Fermer la carte</Text>
          </TouchableOpacity>
        </View>
      </Modal>

      {/* Liste classique */}
      {!mapVisible && (
        <FlatList
          data={cities}
          keyExtractor={(item, index) => index.toString()}
          renderItem={({ item }) => (
            <View style={styles.cityContainer}>
              <Text style={styles.cityName}>{item.name}</Text>
              {item.distance !== undefined && (
                <Text style={styles.cityDistance}>{item.distance.toFixed(1)} km</Text>
              )}
            </View>
          )}
          ListEmptyComponent={
            !loading && !error && <Text style={styles.hint}>Enter a street name and press Search.</Text>
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#f2f6fc", padding: 20, paddingTop: 40 },
  title: { fontSize: 26, fontWeight: "bold", color: "#1D4E89", textAlign: "center", marginBottom: 20 },
  input: {
    backgroundColor: "#fff",
    borderRadius: 12,
    padding: 12,
    fontSize: 16,
    marginBottom: 15,
    shadowColor: "#000",
    shadowOpacity: 0.05,
    shadowOffset: { width: 0, height: 2 },
    shadowRadius: 5,
    elevation: 2,
  },
  buttonRow: { flexDirection: "row", justifyContent: "space-between", marginBottom: 15 },
  button: { flex: 1, backgroundColor: "#4A90E2", marginHorizontal: 5, paddingVertical: 12, borderRadius: 12, alignItems: "center" },
  buttonText: { color: "#fff", fontWeight: "600", fontSize: 14, textAlign: "center" },
  loading: { marginVertical: 20 },
  error: { color: "#E63946", fontWeight: "500", textAlign: "center", marginVertical: 10 },
  cityContainer: {
    backgroundColor: "#fff",
    padding: 15,
    marginBottom: 10,
    borderRadius: 12,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    shadowColor: "#000",
    shadowOpacity: 0.05,
    shadowOffset: { width: 0, height: 2 },
    shadowRadius: 5,
    elevation: 2,
  },
  cityName: { fontSize: 18, color: "#333" },
  cityDistance: { fontSize: 16, color: "#555", fontWeight: "500" },
  hint: { textAlign: "center", marginTop: 15, color: "#666", fontStyle: "italic" },

  mapContainer: { flex: 1 },
  map: { flex: 1 },
  overlayList: {
    position: "absolute",
    bottom: 70,
    left: 20,
    right: 20,
    maxHeight: 200,
    backgroundColor: "rgba(255,255,255,0.9)",
    borderRadius: 12,
    padding: 10,
  },
  closeButton: {
    position: "absolute",
    bottom: 20,
    alignSelf: "center",
    backgroundColor: "#4A90E2",
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 12,
  },
  closeButtonText: { color: "#fff", fontWeight: "600", fontSize: 16 },
});