import { createClient, SupabaseClient, User } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import { Request, Response, NextFunction } from 'express';

// Load environment variables
dotenv.config();

const SUPABASE_URL = process.env.SUPABASE_URL || '';
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || '';

let globalClient: SupabaseClient | null = null;

export function isSupabaseConfigured(): boolean {
  return Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);
}

export function getSupabaseClient(): SupabaseClient | null {
  if (!isSupabaseConfigured()) {
    return null;
  }
  if (!globalClient) {
    globalClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    });
  }
  return globalClient;
}

export function createScopedClient(accessToken: string): SupabaseClient | null {
  if (!isSupabaseConfigured()) return null;
  return createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
    global: {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    },
  });
}

export const authService = {
  async verifyUserToken(token: string): Promise<User | null> {
    const client = getSupabaseClient();
    if (!client) return null;
    try {
      const { data: { user }, error } = await client.auth.getUser(token);
      if (error || !user) {
        return null;
      }
      return user;
    } catch {
      return null;
    }
  },
};

export async function verifyUserToken(token: string): Promise<User | null> {
  return authService.verifyUserToken(token);
}

// Extend Express Request interface
declare global {
  namespace Express {
    interface Request {
      user?: User;
      supabaseScoped?: SupabaseClient;
      token?: string;
    }
  }
}

/**
 * Express middleware: attaches user and scoped client if Bearer token present
 */
export async function optionalAuthMiddleware(req: Request, _res: Response, next: NextFunction): Promise<void> {
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.slice(7).trim();
    if (token) {
      const user = await authService.verifyUserToken(token);
      if (user) {
        req.user = user;
        req.token = token;
        const scoped = createScopedClient(token);
        if (scoped) req.supabaseScoped = scoped;
      }
    }
  }
  next();
}

/**
 * Express middleware: requires valid authentication
 */
export async function requireAuthMiddleware(req: Request, res: Response, next: NextFunction): Promise<void> {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Authentication required. Missing Bearer token.' });
    return;
  }
  const token = authHeader.slice(7).trim();
  const user = await authService.verifyUserToken(token);
  if (!user) {
    res.status(401).json({ error: 'Invalid or expired authentication session.' });
    return;
  }
  req.user = user;
  req.token = token;
  const scoped = createScopedClient(token);
  if (scoped) req.supabaseScoped = scoped;
  next();
}
