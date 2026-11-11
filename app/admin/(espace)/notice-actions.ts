'use server'
import { revalidatePath } from 'next/cache'
import { requireTeacher } from '@/lib/auth/session'
import { getDb } from '@/lib/db/client'
import { markNoticeSeen } from '@/lib/deadlines/notices'

export async function markNoticeSeenAction(noticeId: string): Promise<void> {
  const teacher = await requireTeacher()
  await markNoticeSeen(getDb(), teacher.id, noticeId)
  revalidatePath('/admin', 'layout')
}
