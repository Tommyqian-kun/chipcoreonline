import { Request, Response } from 'express';
import { registerUser } from '../services/auth.service';
import { verifyEmail, verifyEmailCode, resendVerificationCode } from '../services/auth.service';
import { loginUser } from '../services/auth.service';
import { resendVerificationEmail } from '../services/auth.service';
import { requestPasswordReset } from '../services/auth.service';
import { resetPassword } from '../services/auth.service';
import { logoutUser } from '../services/auth.service';

export const register = async (req: Request, res: Response) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ message: 'Email and password are required' });
  }

  try {
    const user = await registerUser(email, password);
    // In a real app, you'd likely send a verification email here
    // and not return the full user object.
    res.status(201).json({ message: 'User created successfully. Please verify your email.', userId: user.id });
  } catch (error: any) {
    if (error.code === 'P2002') { // Prisma unique constraint violation
      return res.status(409).json({ message: 'Email already in use' });
    }
    console.error(error);
    res.status(500).json({ message: 'Internal server error' });
  }
};

export const verifyEmailController = async (req: Request, res: Response) => {
  const { token } = req.query;
  const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';

  if (typeof token !== 'string') {
    return res.status(400).redirect(`${frontendUrl}/email-verification-result?success=false&error=InvalidToken`);
  }

  try {
    const success = await verifyEmail(token);
    if (success) {
      return res.redirect(`${frontendUrl}/email-verification-result?success=true`);
    } else {
      return res.redirect(`${frontendUrl}/email-verification-result?success=false&error=InvalidOrExpiredToken`);
    }
  } catch (error) {
    console.error('Email verification error:', error);
    return res.redirect(`${frontendUrl}/email-verification-result?success=false&error=ServerError`);
  }
};

export const loginController = async (req: Request, res: Response) => {
  const { email, password, rememberMe } = req.body;

  if (!email || !password) {
    return res.status(400).json({ message: 'Email and password are required' });
  }

  try {
    const result = await loginUser(email, password);

    if (!result) {
      return res.status(401).json({ message: '无效的邮箱或密码' });
    }

    const { token, user } = result;

    const cookieOptions = {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict' as const,
      path: '/',
      // maxAge is in milliseconds
      maxAge: (rememberMe ? 7 : 1) * 24 * 60 * 60 * 1000,
    };

    res.cookie('access_token', token, cookieOptions);
    res.status(200).json({ user });

  } catch (error: any) {
    if (error.message === 'EmailNotVerified') {
      return res.status(403).json({ 
        message: '您的邮箱尚未验证，请检查您的收件箱。',
        code: 'EMAIL_NOT_VERIFIED'
      });
    }
    if (error.message === 'ServerConfigurationError') {
      return res.status(500).json({ message: '服务器配置错误' });
    }
    console.error('Login error:', error);
    res.status(500).json({ message: '登录时发生内部错误' });
  }
};

export const logoutController = async (req: Request, res: Response) => {
  try {
    const token = req.cookies.access_token;
    
    // 如果有token，将其加入黑名单
    if (token) {
      await logoutUser(token);
    }
    
    res.clearCookie('access_token', {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      path: '/',
    });
    
    return res.status(200).json({ message: '成功退出登录' });
  } catch (error) {
    console.error('Logout error:', error);
    // 即使黑名单操作失败，也要清除cookie
    res.clearCookie('access_token', {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      path: '/',
    });
    return res.status(200).json({ message: '成功退出登录' });
  }
};

export const resendVerificationController = async (req: Request, res: Response) => {
  const { email } = req.body;
  if (!email) {
    return res.status(400).json({ message: 'Email is required' });
  }

  try {
    await resendVerificationEmail(email);
    // 始终返回成功，防止邮箱枚举攻击
    return res.status(200).json({ message: '如果该邮箱已注册且尚未验证，验证邮件已发送。' });
  } catch (error) {
    console.error('Resend verification error:', error);
    // 通用错误响应
    res.status(500).json({ message: '请求失败，请稍后再试。' });
  }
};

export const requestPasswordResetController = async (req: Request, res: Response) => {
  const { email } = req.body;
  if (!email) {
    return res.status(400).json({ message: 'Email is required' });
  }

  try {
    await requestPasswordReset(email);
    return res.status(200).json({ message: '如果该邮箱已注册，密码重置邮件已发送。' });
  } catch (error) {
    console.error('Request password reset error:', error);
    res.status(500).json({ message: '请求失败，请稍后再试。' });
  }
};

export const resetPasswordController = async (req: Request, res: Response) => {
  const { token, newPassword } = req.body;
  if (!token || !newPassword) {
    return res.status(400).json({ message: 'Token and new password are required' });
  }

  // 密码复杂度校验
  if (newPassword.length < 6) {
    return res.status(400).json({ message: 'Password must be at least 6 characters long' });
  }

  try {
    const success = await resetPassword(token, newPassword);
    if (success) {
      return res.status(200).json({ message: '密码已成功重置。' });
    } else {
      return res.status(400).json({ message: '无效或已过期的重置链接。' });
    }
  } catch (error) {
    console.error('Reset password error:', error);
    res.status(500).json({ message: '请求失败，请稍后再试。' });
  }
};

// 验证邮箱验证码
export const verifyCodeController = async (req: Request, res: Response) => {
  const { email, code } = req.body;

  if (!email || !code) {
    return res.status(400).json({ message: '邮箱和验证码不能为空。' });
  }

  try {
    const success = await verifyEmailCode(email, code);
    if (success) {
      return res.status(200).json({ message: '邮箱验证成功！' });
    } else {
      return res.status(400).json({ message: '验证码无效或已过期。' });
    }
  } catch (error) {
    console.error('Verify code error:', error);
    res.status(500).json({ message: '验证失败，请稍后再试。' });
  }
};

// 重新发送验证码
export const resendCodeController = async (req: Request, res: Response) => {
  const { email } = req.body;

  if (!email) {
    return res.status(400).json({ message: '邮箱不能为空。' });
  }

  try {
    const success = await resendVerificationCode(email);
    if (success) {
      return res.status(200).json({ message: '验证码已重新发送到您的邮箱。' });
    } else {
      return res.status(400).json({ message: '用户不存在或已验证。' });
    }
  } catch (error) {
    console.error('Resend code error:', error);
    res.status(500).json({ message: '发送失败，请稍后再试。' });
  }
};