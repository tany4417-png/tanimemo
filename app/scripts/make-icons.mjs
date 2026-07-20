import sharp from "sharp";

for (const [size, name] of [[192, "icon-192.png"], [512, "icon-512.png"], [180, "apple-touch-icon.png"]]) {
  await sharp("icon.svg").resize(size, size).png().toFile(`public/${name}`);
  console.log(`generated public/${name}`);
}
