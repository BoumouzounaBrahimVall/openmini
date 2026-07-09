module.exports = {
  presets: ['module:@react-native/babel-preset'],
  // zod v4 ESM uses `export * as ns from` which the RN preset leaves as-is.
  plugins: ['@babel/plugin-transform-export-namespace-from'],
};
