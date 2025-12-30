import nodemailer from 'nodemailer';

// 创建一个可复用的 transporter 对象
// 在开发环境中，我们使用 Ethereal 来捕获邮件
let transporter: nodemailer.Transporter;

async function getTestAccount() {
  let testAccount = await nodemailer.createTestAccount();
  console.log('Ethereal test account created:');
  console.log(`User: ${testAccount.user}`);
  console.log(`Pass: ${testAccount.pass}`);
  console.log(`Preview URL: (use any message URL from console logs)`);
  return testAccount;
}

// 导出一个异步函数来获取 transporter
export const getTransporter = async () => {
  if (!transporter) {
    // 检查是否配置了真实的邮件服务
    const emailHost = process.env.EMAIL_HOST;
    const emailUser = process.env.EMAIL_USER;
    const emailPass = process.env.EMAIL_PASS;

    if (emailHost && emailUser && emailPass && emailPass !== 'YOUR_EMAIL_PASSWORD_HERE') {
      // 使用真实的SMTP配置
      console.log('Using real SMTP configuration:', emailHost);
      try {
        transporter = nodemailer.createTransport({
          host: emailHost,
          port: parseInt(process.env.EMAIL_PORT || '587'),
          secure: process.env.EMAIL_SECURE === 'true', // true for 465, false for other ports
          auth: {
            user: emailUser,
            pass: emailPass,
          },
        });

        // 测试SMTP连接
        await transporter.verify();
        console.log('SMTP connection verified successfully');
      } catch (error) {
        console.log('SMTP verification failed, falling back to test email service:', (error as Error).message);
        transporter = null as any; // 重置transporter，使用测试邮件服务
      }
    }

    if (!transporter) {
      // 回退到测试邮件服务
      console.log('Using Ethereal test email service');
      const testAccount = await getTestAccount();
      transporter = nodemailer.createTransport({
        host: 'smtp.ethereal.email',
        port: 587,
        secure: false, // true for 465, false for other ports
        auth: {
          user: testAccount.user,
          pass: testAccount.pass,
        },
      });
    }
  }
  return transporter;
};

export const sendVerificationEmail = async (email: string, token: string) => {
  const mailer = await getTransporter();
  const backendUrl = process.env.API_BASE_URL || 'http://localhost:8080';
  const verificationUrl = `${backendUrl}/api/v1/auth/verify-email?token=${token}`;
  const fromEmail = process.env.EMAIL_FROM || '"ChipCore" <noreply@chipcore.com>';

  const info = await mailer.sendMail({
    from: fromEmail,
    to: email,
    subject: '欢迎来到 ChipCore - 请验证您的邮箱',
    text: `请点击此链接验证您的邮箱: ${verificationUrl}`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #f97316;">欢迎来到 ChipCore！</h2>
        <p>感谢您注册 ChipCore 账户。请点击下面的链接验证您的邮箱地址：</p>
        <div style="text-align: center; margin: 30px 0;">
          <a href="${verificationUrl}" style="background-color: #f97316; color: white; padding: 12px 24px; text-decoration: none; border-radius: 5px; display: inline-block;">验证邮箱</a>
        </div>
        <p style="color: #666; font-size: 14px;">如果按钮无法点击，请复制以下链接到浏览器地址栏：</p>
        <p style="color: #666; font-size: 14px; word-break: break-all;">${verificationUrl}</p>
        <p style="color: #666; font-size: 12px; margin-top: 30px;">此链接24小时内有效。如果您没有注册 ChipCore 账户，请忽略此邮件。</p>
      </div>
    `,
  });

  console.log('Message sent: %s', info.messageId);
  // 在 Ethereal 中预览邮件的链接（仅测试环境）
  if (nodemailer.getTestMessageUrl(info)) {
    console.log('Preview URL: %s', nodemailer.getTestMessageUrl(info));
  }
};

// 新增：发送验证码邮件
export const sendVerificationCodeEmail = async (email: string, code: string) => {
  console.log('🔧 Starting email send process...');
  const mailer = await getTransporter();
  const fromEmail = process.env.EMAIL_FROM || '"ChipCore" <noreply@chipcore.com>';
  console.log('📧 Sending verification code email to:', email);

  const info = await mailer.sendMail({
    from: fromEmail,
    to: email,
    subject: 'ChipCore 邮箱验证码',
    text: `您的验证码是: ${code}`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
        <div style="text-align: center; margin-bottom: 30px;">
          <h1 style="color: #f97316; margin: 0;">ChipCore</h1>
          <p style="color: #666; margin: 5px 0;">专业的芯片设计工具平台</p>
        </div>

        <div style="background: #f8f9fa; border-radius: 8px; padding: 30px; text-align: center;">
          <h2 style="color: #333; margin-bottom: 20px;">邮箱验证码</h2>
          <p style="color: #666; margin-bottom: 30px;">感谢您注册 ChipCore！请使用以下验证码完成邮箱验证：</p>

          <div style="background: white; border: 2px dashed #f97316; border-radius: 8px; padding: 20px; margin: 20px 0;">
            <div style="font-size: 32px; font-weight: bold; color: #f97316; letter-spacing: 8px; font-family: 'Courier New', monospace;">
              ${code}
            </div>
          </div>

          <p style="color: #666; font-size: 14px; margin-top: 20px;">
            验证码有效期为 <strong>2分钟</strong>，请及时使用。
          </p>
        </div>

        <div style="margin-top: 30px; padding-top: 20px; border-top: 1px solid #eee; text-align: center;">
          <p style="color: #999; font-size: 12px; margin: 0;">
            如果您没有注册 ChipCore 账户，请忽略此邮件。<br>
            此邮件由系统自动发送，请勿回复。
          </p>
        </div>
      </div>
    `,
  });

  console.log('Verification code email sent:', info.messageId);
  if (process.env.NODE_ENV === 'development') {
    console.log('Preview URL:', nodemailer.getTestMessageUrl(info));
  }
};

export const sendPasswordResetEmail = async (email: string, token: string) => {
  const mailer = await getTransporter();
  const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
  const resetUrl = `${frontendUrl}/auth/reset-password?token=${token}`;
  const fromEmail = process.env.EMAIL_FROM || '"ChipCore" <noreply@chipcore.com>';

  const info = await mailer.sendMail({
    from: fromEmail,
    to: email,
    subject: 'ChipCore 密码重置请求',
    text: `您正在重置密码。请点击此链接设置新密码: ${resetUrl}`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #f97316;">密码重置请求</h2>
        <p>您正在重置 ChipCore 账户的密码。请点击下面的链接设置新密码：</p>
        <div style="text-align: center; margin: 30px 0;">
          <a href="${resetUrl}" style="background-color: #f97316; color: white; padding: 12px 24px; text-decoration: none; border-radius: 5px; display: inline-block;">重置密码</a>
        </div>
        <p style="color: #666; font-size: 14px;">如果按钮无法点击，请复制以下链接到浏览器地址栏：</p>
        <p style="color: #666; font-size: 14px; word-break: break-all;">${resetUrl}</p>
        <p style="color: #666; font-size: 12px; margin-top: 30px;">此链接1小时内有效。如果您没有请求密码重置，请忽略此邮件。</p>
      </div>
    `,
  });

  console.log('Password reset message sent: %s', info.messageId);
  if (nodemailer.getTestMessageUrl(info)) {
    console.log('Preview URL: %s', nodemailer.getTestMessageUrl(info));
  }
};