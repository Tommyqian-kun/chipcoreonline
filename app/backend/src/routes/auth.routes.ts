import { Router } from 'express';
import { register, verifyEmailController, loginController, logoutController, resendVerificationController, requestPasswordResetController, resetPasswordController, verifyCodeController, resendCodeController } from '../controllers/auth.controller';

const router = Router();

router.post('/register', register);
router.get('/verify-email', verifyEmailController);
router.post('/verify-code', verifyCodeController);
router.post('/resend-verification-code', resendCodeController);
router.post('/login', loginController);
router.post('/logout', logoutController);
router.post('/resend-verification', resendVerificationController);
router.post('/request-password-reset', requestPasswordResetController);
router.post('/reset-password', resetPasswordController);

export default router; 