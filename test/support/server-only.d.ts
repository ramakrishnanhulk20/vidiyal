// The desk marks its server modules with the server-only package, which ships no types and
// throws the moment it is loaded anywhere but a React server. The engine's tests compile
// one of those modules, so the marker is declared here and mocked away in the test itself.
declare module "server-only";
