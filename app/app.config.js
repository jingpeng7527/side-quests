// Extends app.json with values that come from the environment at build time,
// so keys never have to be committed.
//   GOOGLE_MAPS_ANDROID_API_KEY — required for maps in Android builds (Expo Go doesn't need it).
module.exports = ({ config }) => {
  const mapsKey = process.env.GOOGLE_MAPS_ANDROID_API_KEY;
  if (!mapsKey) return config;
  return {
    ...config,
    plugins: [...(config.plugins ?? []), ["react-native-maps", { androidGoogleMapsApiKey: mapsKey }]],
  };
};
