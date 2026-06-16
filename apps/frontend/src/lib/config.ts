const getBackendUrl = () => {
  let url: string | undefined;

  try {
    url = import.meta.env.VITE_BACKEND_URL;
  } catch (e) {
    // import.meta.env is not defined in this environment
  }

  if (!url) {
    try {
      url = process.env.VITE_BACKEND_URL;
    } catch (e) {
      // process is not defined in the browser
    }
  }

  if (!url) {
    console.warn("[SkillWise.ai API] WARNING: VITE_BACKEND_URL is missing or undefined. Falling back to http://localhost:3001 for local development.");
    return "http://localhost:3001";
  }

  return url;
};

export const API_BASE_URL = getBackendUrl();
export const BACKEND_URL = API_BASE_URL;