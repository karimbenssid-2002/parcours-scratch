import { jwtVerify, SignJWT } from 'jose'

export const ADMIN_COOKIE = 'admin_session'
export const STUDENT_COOKIE = 'student_session'

export type AdminClaims = { teacherId: string; username: string; role: 'admin' | 'prof'; mustChangePassword: boolean }
export type StudentClaims = { studentId: string; mustChangePassword: boolean }

function key(name: 'AUTH_SECRET' | 'STUDENT_AUTH_SECRET'): Uint8Array {
  const value = process.env[name]
  if (!value || value.length < 32) throw new Error(`${name} manquant ou trop court (32 caractères minimum)`)
  // Les valeurs d'exemple de .env.example sont publiques : les accepter permettrait de forger des sessions.
  if (value.startsWith('remplacer')) throw new Error(`${name} : remplacez la valeur d'exemple par un secret aléatoire`)
  return new TextEncoder().encode(value)
}

export async function signAdmin(c: AdminClaims): Promise<string> {
  return new SignJWT({ ...c }).setProtectedHeader({ alg: 'HS256' }).setAudience('admin').setIssuedAt()
    .setExpirationTime('7d').sign(key('AUTH_SECRET'))
}

export async function verifyAdmin(token: string): Promise<AdminClaims | null> {
  try {
    const { payload: p } = await jwtVerify(token, key('AUTH_SECRET'), { audience: 'admin' })
    if (typeof p.teacherId !== 'string' || typeof p.username !== 'string') return null
    if (p.role !== 'admin' && p.role !== 'prof') return null
    return { teacherId: p.teacherId, username: p.username, role: p.role, mustChangePassword: p.mustChangePassword === true }
  } catch {
    return null
  }
}

export async function signStudent(c: StudentClaims): Promise<string> {
  return new SignJWT({ ...c }).setProtectedHeader({ alg: 'HS256' }).setAudience('student').setIssuedAt()
    .setExpirationTime('30d').sign(key('STUDENT_AUTH_SECRET'))
}

export async function verifyStudent(token: string): Promise<StudentClaims | null> {
  try {
    const { payload: p } = await jwtVerify(token, key('STUDENT_AUTH_SECRET'), { audience: 'student' })
    if (typeof p.studentId !== 'string') return null
    return { studentId: p.studentId, mustChangePassword: p.mustChangePassword === true }
  } catch {
    return null
  }
}
