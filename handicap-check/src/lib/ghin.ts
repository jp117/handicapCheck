import { google } from 'googleapis'
import { OAuth2Client } from 'google-auth-library'
import * as XLSX from 'xlsx'

interface GHINScore {
  name: string
  score: number
  date: string
}

export async function parseGHINData(
  gmail: any,
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
    const attachment = message.data.payload.parts?.find(
      (part: any) => part.filename?.endsWith('.xlsx')
    )

    if (!attachment) {
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
    const buffer = Buffer.from(data, 'base64')

    // Parse the XLSX file
    const workbook = XLSX.read(buffer, { type: 'buffer' })
    const worksheet = workbook.Sheets[workbook.SheetNames[0]]
    const rows = XLSX.utils.sheet_to_json(worksheet)

    // Process the rows into GHINScore objects
    const scores: GHINScore[] = rows.map((row: any) => ({
      name: row['Player Name'],
      score: parseInt(row['Score']),
      date: row['Date']
    }))

    return scores
  } catch (error) {
    console.error('Error parsing GHIN data:', error)
    throw error
  }
} 