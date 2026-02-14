import axios from "axios";
require("dotenv").config();

// ts-node -r dotenv/config verify-pexels.ts

async function run() {
  try {
    const apiKey = process.env.PEXELS_API_KEY;
    if (!apiKey) {
      console.error("PEXELS_API_KEY not set in .env");
      return;
    }

    console.log('Searching Pexels for "nature"...');

    const response = await axios.get("https://api.pexels.com/v1/search", {
      params: {
        query: "nature",
        per_page: 5,
      },
      headers: {
        Authorization: apiKey,
      },
    });

    console.log("Status:", response.status);
    console.log("Results (first 5):");

    for (const photo of response.data.photos) {
      console.log(
        `- ID: ${photo.id}, Photographer: ${photo.photographer}, URL: ${photo.src.large}`,
      );
    }
  } catch (e: any) {
    if (e.response) {
      console.error("Pexels API Error:", e.response.status, e.response.data);
    } else {
      console.error("Error:", e.message);
    }
  }
}

run();
