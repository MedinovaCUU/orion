const compact = (value = '') => String(value || '').trim();

export class OrionTrackingApi {
  constructor(config, agent) {
    this.endpoint = `${compact(config.supabaseUrl).replace(/\/$/, '')}/functions/v1/tracking-agent-sync`;
    this.anonKey = compact(config.supabaseAnonKey);
    this.agentToken = compact(config.agentToken);
    this.agent = agent;
  }

  async request(action, payload = {}) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 30_000);

    try {
      const response = await fetch(this.endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          apikey: this.anonKey,
          Authorization: `Bearer ${this.anonKey}`,
          'x-tracking-agent-token': this.agentToken,
        },
        body: JSON.stringify({
          action,
          agentId: this.agent.agentId,
          hostname: this.agent.hostname,
          version: this.agent.version,
          ...payload,
        }),
        signal: controller.signal,
      });

      const result = await response.json().catch(() => ({}));
      if (!response.ok || result.ok === false) {
        throw new Error(compact(result.error) || `Orion respondió HTTP ${response.status}.`);
      }

      return result;
    } finally {
      clearTimeout(timeout);
    }
  }

  heartbeat(payload = {}) {
    return this.request('heartbeat', payload);
  }

  async claim(limit) {
    const response = await this.request('claim', { limit });
    return Array.isArray(response.jobs) ? response.jobs : [];
  }

  report(jobId, result) {
    return this.request('report', { jobId, result });
  }
}
