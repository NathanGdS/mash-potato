/** Canonical timing phase type — field names match Go JSON tags (snake_case). */
export interface TimingPhases {
  dns_lookup: number;
  tcp_handshake: number;
  tls_handshake: number;
  ttfb: number;
  download: number;
}
