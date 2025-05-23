import * as XLSX from 'xlsx'
import { gmail_v1 } from 'googleapis'

interface GHINScore {
  name: string
  score: number
  date: string
}

export async function parseGHINData(
  gmail: gmail_v1.Gmail,
  messageId: string,
  userId: string
): Promise<GHINScore[]> {
  try {
    // Get the message
    const message = await gmail.users.messages.get({
      id: messageId,
      userId: userId
    })

    // Find the XLSX attachment
    const attachment = message.data.payload?.parts?.find(
      (part: gmail_v1.Schema$MessagePart) => part.filename?.endsWith('.xlsx')
    )

    if (!attachment || !attachment.body?.attachmentId) {
      throw new Error('No XLSX attachment found')
    }

    // Get the attachment data
    const attachmentData = await gmail.users.messages.attachments.get({
      id: attachment.body.attachmentId,
      messageId: messageId,
      userId: userId
    })

    // Decode the attachment data
    const data = attachmentData.data.data
    const buffer = Buffer.from(data!, 'base64')

    // Parse the XLSX file
    const workbook = XLSX.read(buffer, { type: 'buffer' })
    const worksheet = workbook.Sheets[workbook.SheetNames[0]]
    const rows = XLSX.utils.sheet_to_json(worksheet) as Record<string, unknown>[]

    // Process the rows into GHINScore objects
    const scores: GHINScore[] = rows.map((row) => ({
      name: String(row['Player Name'] ?? ''),
      score: parseInt(String(row['Score'] ?? '0')),
      date: String(row['Date'] ?? '')
    }))

    return scores
  } catch (error) {
    console.error('Error parsing GHIN data:', error)
    throw error
  }
} 