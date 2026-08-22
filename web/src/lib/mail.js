import nodemailer from 'nodemailer'

export async function sendOtpEmail(email, otpCode, name = 'User') {
  const from = process.env.MAIL_FROM_ADDRESS || 'hello@learnai.local'
  const fromName = process.env.MAIL_FROM_NAME || 'LearnAI'
  const html = `
    <div style="font-family:sans-serif;max-width:480px">
      <h2 style="margin:0">LearnAI</h2>
      <p>Hi ${name},</p>
      <p>Welcome to LearnAI! Please use the OTP below to verify your email and continue.</p>
      <p style="font-size:28px;letter-spacing:6px;font-weight:700">${otpCode}</p>
      <p>This code expires in 10 minutes.</p>
    </div>
  `

  if (!process.env.MAIL_HOST) {
    console.info(`[otp] ${email}: ${otpCode}`)
    return null
  }

  try {
    const transporter = nodemailer.createTransport({
      host: process.env.MAIL_HOST,
      port: Number(process.env.MAIL_PORT || 587),
      secure: Number(process.env.MAIL_PORT) === 465,
      auth: process.env.MAIL_USERNAME
        ? { user: process.env.MAIL_USERNAME, pass: process.env.MAIL_PASSWORD }
        : undefined,
    })
    await transporter.sendMail({
      from: `"${fromName}" <${from}>`,
      to: email,
      subject: 'Your OTP code',
      html,
    })
    return null
  } catch (error) {
    return `Failed to send OTP email: ${error.message}`
  }
}
