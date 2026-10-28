import fs from "fs";
import path from "path";

const mdPath = "z:\\Admin\\Downloads\\3D Basic Labeling Tutorial.md";
const outputDir = "d:\\Code\\Xnite\\frontend\\public\\tutorial";

// Create output directory if it doesn't exist
if (!fs.existsSync(outputDir)) {
  fs.mkdirSync(outputDir, { recursive: true });
}

try {
  const content = fs.readFileSync(mdPath, "utf8");
  
  // Regex to match markdown reference link syntax: [imageX]: <data:image/png;base64,BASE64_DATA>
  const regex = /\[image(\d+)\]:\s*<data:image\/png;base64,([^>]+)>/g;
  
  let match;
  let count = 0;
  
  while ((match = regex.exec(content)) !== null) {
    const num = match[1];
    const base64Data = match[2].trim();
    
    const buffer = Buffer.from(base64Data, "base64");
    const filename = `image${num}.png`;
    const outputPath = path.join(outputDir, filename);
    
    fs.writeFileSync(outputPath, buffer);
    console.log(`Saved ${filename} to ${outputPath} (${buffer.length} bytes)`);
    count++;
  }
  
  console.log(`Successfully extracted ${count} images!`);
} catch (error) {
  console.error("Error extracting images:", error);
}
