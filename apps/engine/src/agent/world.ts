/**
 * In-memory world state. The agent's "reality."
 * Mutable singleton — replaced on each run via resetWorld().
 * No persistence here (SQLite/event sourcing comes Day 2).
 */

export interface Email {
  id: string;
  from: string;
  to: string;
  subject: string;
  body: string;
  receivedAt: number; // ms epoch
  read: boolean;
}

export interface Customer {
  id: string;
  name: string;
  email: string;
  company: string;
  plan: 'starter' | 'growth' | 'enterprise';
  mrr: number; // USD
}

export interface SlackMessage {
  channel: string;
  message: string;
  sentAt: number;
}

export interface SentEmail {
  to: string;
  subject: string;
  body: string;
  sentAt: number;
}

export interface WorldState {
  inbox: Email[];
  customers: Customer[];
  slackLog: SlackMessage[];
  sentEmails: SentEmail[];
}

let _world: WorldState = {
  inbox: [],
  customers: [],
  slackLog: [],
  sentEmails: [],
};

export function getWorld(): WorldState {
  return _world;
}

export function resetWorld(seed: Partial<WorldState> = {}): void {
  _world = {
    inbox: seed.inbox ?? [],
    customers: seed.customers ?? [],
    slackLog: seed.slackLog ?? [],
    sentEmails: seed.sentEmails ?? [],
  };
}
