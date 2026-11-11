import { jwtVerify, SignJWT } from 'jose'

export const ADMIN_COOKIE = 'admin_session'
export const STUDENT_COOKIE = 'student_session'

export type AdminClaims = { teacherId: string; username: string; role: 'admin' | 'prof' }
export type StudentClaims = { studentId: string }

const REGISTERED = ['aud', 'iat', 'exp']
/** Exactement les champs attendus : un jeton à un autre format (celui d'avant la connexion Google portait l'obligation de
 * changer de mot de passe) est refusé ; il suffit de se reconnecter. */
const hasOnly = (p: object, fields: string[]) => Object.keys(p).every((k) => fields.includes(k) || REGISTERED.includes(k))

export function secretKey(name: 'AUTH_SECRET' | 'STUDENT_AUTH_SECRET'): Uint8Array {
  const value = process.env[name]
  if (!value || value.length < 32) throw new Error(`${name} manquant ou trop court (32 caractères minimum)`)
  // Les valeurs d'exemple de .env.example sont publiques : les accepter permettrait de forger des sessions.
  if (value.startsWith('remplacer')) throw new Error(`${name} : remplacez la valeur d'exemple par un secret aléatoire`)
  return new TextEncoder().encode(value)
}

export async function signAdmin(c: AdminClaims): Promise<string> {
  return new SignJWT({ ...c }).setProtectedHeader({ alg: 'HS256' }).setAudience('admin').setIssuedAt()
    .setExpirationTime('7d').sign(secretKey('AUTH_SECRET'))
}

export async function verifyAdmin(token: string): Promise<AdminClaims | null> {
  try {
    const { payload: p } = await jwtVerify(token, secretKey('AUTH_SECRET'), { audience: 'admin' })
    if (!hasOnly(p, ['teacherId', 'username', 'role']) || typeof p.teacherId !== 'string' || typeof p.username !== 'string') return null
    if (p.role !== 'admin' && p.role !== 'prof') return null
    return { teacherId: p.teacherId, username: p.username, role: p.role }
  } catch {
    return null
  }
}

export async function signStudent(c: StudentClaims): Promise<string> {
  return new SignJWT({ ...c }).setProtectedHeader({ alg: 'HS256' }).setAudience('student').setIssuedAt()
    .setExpirationTime('30d').sign(secretKey('STUDENT_AUTH_SECRET'))
}

export async function verifyStudent(token: string): Promise<StudentClaims | null> {
  try {
    const { payload: p } = await jwtVerify(token, secretKey('STUDENT_AUTH_SECRET'), { audience: 'student' })
    if (!hasOnly(p, ['studentId']) || typeof p.studentId !== 'string') return null
    return { studentId: p.studentId }
  } catch {
    return null
  }
}
