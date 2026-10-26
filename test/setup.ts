import { config } from "dotenv";
import path from "path";

// Tests run outside Next.js, which normally loads .env automatically.
config({ path: path.resolve(__dirname, "../.env") });
