import axios from "axios";
 
export async function scrapeGithub(username: string) {
  try {
    const response = await axios.get(
      `https://api.github.com/users/${username}/repos`,
      {
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
          "Accept": "application/vnd.github.v3+json",
        }
      }
    );

    return response.data.map((repo: any) => ({
      name: repo.name,
      description: repo.description,
      stars: repo.stargazers_count,
      language: repo.language,
      url: repo.html_url,
    }));
  } catch (error) {
    console.error("Error fetching GitHub repos:", error);
    return [];
  }
}