/** @type {import('next').NextConfig} */
const nextConfig = {
  // Next.js w trybie dev domyslnie blokuje zasoby (chunki JS, HMR) dla hostow
  // innych niz localhost. Bez tego telefon w sieci LAN dostaje tylko HTML/CSS
  // (czarny ekran), bo React nigdy sie nie uruchamia.
  // Wpisujemy sam hostname - bez http:// i bez portu.
  allowedDevOrigins: ['192.168.100.5'],
  // Wylacza wskaznik "N" (Next.js dev tools) oraz overlay z bledami.
  devIndicators: false,
  reactStrictMode: false,
}
export default nextConfig