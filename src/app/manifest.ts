import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "ClassDiary",
    short_name: "ClassDiary",
    description: "Gestão escolar, diário de classe e comunicação em uma única plataforma.",
    start_url: "/dashboard/meu-dia",
    display: "standalone",
    background_color: "#0b1120",
    theme_color: "#5b5bd6",
    orientation: "portrait-primary",
    icons: [
      { src: "/icon-192.svg", sizes: "192x192", type: "image/svg+xml", purpose: "any" },
      { src: "/icon-512.svg", sizes: "512x512", type: "image/svg+xml", purpose: "any" },
    ],
  };
}
