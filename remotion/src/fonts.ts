import { loadFont as loadDisplay } from "@remotion/google-fonts/Archivo";
import { loadFont as loadBody } from "@remotion/google-fonts/Outfit";

export const display = loadDisplay("normal", { weights: ["900"], subsets: ["latin"] }).fontFamily;
export const body = loadBody("normal", { weights: ["400", "600"], subsets: ["latin"] }).fontFamily;
