import initModels from './mongooseCompat.js';

let models = null;

export const getModels = () => {
  if (!models) {
    models = initModels();
  }
  return models;
};

export default getModels;
