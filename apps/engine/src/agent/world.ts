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
  balance: number; // account credit balance USD
  lifetimeValue: number; // total USD paid
  tier: 'free' | 'pro' | 'enterprise';
  piiClass: 'low' | 'medium' | 'high';
}

export interface Ticket {
  id: string;
  customerId: string;
  subject: string;
  body: string;
  status: 'open' | 'in_progress' | 'resolved' | 'closed';
  priority: 'low' | 'medium' | 'high' | 'urgent';
  createdAt: number;
  resolvedAt?: number;
  resolution?: string;
}

export interface RefundRecord {
  id: string;
  customerId: string;
  ticketId: string;
  amount: number; // USD
  reason: string;
  issuedAt: number;
  issuedBy: string; // agent id or 'human'
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
  tickets: Ticket[];
  refunds: RefundRecord[];
}

let _world: WorldState = {
  inbox: [],
  customers: [],
  slackLog: [],
  sentEmails: [],
  tickets: [],
  refunds: [],
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
    tickets: seed.tickets ?? [],
    refunds: seed.refunds ?? [],
  };
}
