/**
 * middleware.js
 * Comprehensive Route Guarding for Next.js 14.
 * Rule: /login (public), /dashboard (auth), /admin (admin), /accountant (accountant)
 */
import { NextResponse } from 'next/server';

export function middleware(request) {
    const { pathname } = request.nextUrl;
    const session = request.cookies.get('fom_session')?.value;
    const role = request.cookies.get('fom_role')?.value;

    // 1. Identify context
    const isLoginPath = pathname === '/login';
    const isDashboardPath = pathname.startsWith('/dashboard');
    const isAdminPath = pathname.startsWith('/dashboard/admin');
    const isAccountantPath = pathname.startsWith('/dashboard/accountant');

    // 2. Redirect logged-in users away from /login
    if (isLoginPath && session) {
        // Redirection based on role
        if (role === 'ADMIN') return NextResponse.redirect(new URL('/dashboard/admin/users', request.url));
        if (role === 'ACCOUNTANT') return NextResponse.redirect(new URL('/dashboard/accountant', request.url));
        return NextResponse.redirect(new URL('/dashboard', request.url));
    }

    // 3. Protect all dashboard routes
    if (isDashboardPath && !session) {
        return NextResponse.redirect(new URL('/login', request.url));
    }

    // 4. Role-Based Access Control (RBAC)
    if (isAdminPath && role !== 'ADMIN') {
        return NextResponse.redirect(new URL('/unauthorized', request.url));
    }

    if (isAccountantPath && role !== 'ACCOUNTANT') {
        // Admins can see accountant view, but not vice-versa
        if (role !== 'ADMIN') return NextResponse.redirect(new URL('/unauthorized', request.url));
    }

    return NextResponse.next();
}

export const config = {
    matcher: ['/dashboard/:path*', '/login'],
};
