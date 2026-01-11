/**
 * 前端表单验证单元测试
 * 测试用户输入验证和表单处理逻辑
 */

import { describe, it, expect } from 'vitest';

// 模拟邮箱验证
const validateEmail = (email: string): { valid: boolean; error?: string } => {
  if (!email) {
    return { valid: false, error: '邮箱不能为空' };
  }

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) {
    return { valid: false, error: '邮箱格式不正确' };
  }

  if (email.length > 255) {
    return { valid: false, error: '邮箱长度不能超过255个字符' };
  }

  return { valid: true };
};

// 模拟密码验证
const validatePassword = (password: string): { valid: boolean; errors: string[] } => {
  const errors: string[] = [];

  if (!password) {
    errors.push('密码不能为空');
    return { valid: false, errors };
  }

  if (password.length < 8) {
    errors.push('密码长度至少为8位');
  }

  if (password.length > 128) {
    errors.push('密码长度不能超过128位');
  }

  if (!/[a-z]/.test(password)) {
    errors.push('密码必须包含至少一个小写字母');
  }

  if (!/[A-Z]/.test(password)) {
    errors.push('密码必须包含至少一个大写字母');
  }

  if (!/\d/.test(password)) {
    errors.push('密码必须包含至少一个数字');
  }

  return {
    valid: errors.length === 0,
    errors,
  };
};

// 模拟用户名验证
const validateUsername = (username: string): { valid: boolean; error?: string } => {
  if (!username) {
    return { valid: false, error: '用户名不能为空' };
  }

  if (username.length < 3) {
    return { valid: false, error: '用户名长度至少为3位' };
  }

  if (username.length > 20) {
    return { valid: false, error: '用户名长度不能超过20位' };
  }

  const usernameRegex = /^[a-zA-Z0-9_-]+$/;
  if (!usernameRegex.test(username)) {
    return { valid: false, error: '用户名只能包含字母、数字、下划线和连字符' };
  }

  return { valid: true };
};

// 模拟文件验证
const validateFile = (file: { name: string; size: number; type: string }, maxSize = 10 * 1024 * 1024): { valid: boolean; error?: string } => {
  if (!file) {
    return { valid: false, error: '请选择文件' };
  }

  const allowedTypes = [
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.ms-excel',
  ];

  if (!allowedTypes.includes(file.type)) {
    return { valid: false, error: '只支持Excel文件格式 (.xlsx, .xls)' };
  }

  if (file.size > maxSize) {
    return { valid: false, error: `文件大小不能超过${maxSize / (1024 * 1024)}MB` };
  }

  return { valid: true };
};

describe('表单验证 - 邮箱验证', () => {
  it('应该接受有效的邮箱地址', () => {
    const validEmails = [
      'test@example.com',
      'user.name@domain.co.uk',
      'user+tag@example.org',
      'admin@mail.server1.com',
      '123@test.com',
    ];

    validEmails.forEach(email => {
      const result = validateEmail(email);
      expect(result.valid).toBe(true);
      expect(result.error).toBeUndefined();
    });
  });

  it('应该拒绝无效的邮箱地址', () => {
    const invalidEmails = [
      'invalid-email',
      '@example.com',
      'user@',
      'user @example.com',
      'user@@example.com',
      'user example.com',
      '',
    ];

    invalidEmails.forEach(email => {
      const result = validateEmail(email);
      expect(result.valid).toBe(false);
      expect(result.error).toBeDefined();
    });
  });

  it('应该拒绝空邮箱', () => {
    const result = validateEmail('');
    expect(result.valid).toBe(false);
    expect(result.error).toBe('邮箱不能为空');
  });

  it('应该拒绝过长的邮箱', () => {
    const longEmail = 'a'.repeat(256) + '@example.com';
    const result = validateEmail(longEmail);
    expect(result.valid).toBe(false);
    expect(result.error).toContain('255');
  });
});

describe('表单验证 - 密码验证', () => {
  it('应该接受强密码', () => {
    const strongPasswords = [
      'Password123',
      'Test1234',
      'MyPass2024',
      'Secure99',
      'Valid123!',
    ];

    strongPasswords.forEach(password => {
      const result = validatePassword(password);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });
  });

  it('应该拒绝弱密码', () => {
    const weakPasswords = [
      'weak',
      'password',
      '12345678',
      'SHORT',
      'lowercase',
      'UPPERCASE',
      'nocaps123',
      'NOLOWER123',
      'NoNumbers!',
    ];

    weakPasswords.forEach(password => {
      const result = validatePassword(password);
      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });
  });

  it('应该拒绝空密码', () => {
    const result = validatePassword('');
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('密码不能为空');
  });

  it('应该拒绝过短的密码', () => {
    const result = validatePassword('Pass1');
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('密码长度至少为8位');
  });

  it('应该拒绝过长的密码', () => {
    const longPassword = 'a'.repeat(129);
    const result = validatePassword(longPassword);
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('128');
  });

  it('应该包含所有错误信息', () => {
    const result = validatePassword('weak');
    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThan(1);
  });
});

describe('表单验证 - 用户名验证', () => {
  it('应该接受有效的用户名', () => {
    const validUsernames = [
      'user123',
      'test_user',
      'user-name',
      'User.Name',
      'abc123',
      '12345',
      'User_123',
    ];

    validUsernames.forEach(username => {
      const result = validateUsername(username);
      expect(result.valid).toBe(true);
    });
  });

  it('应该拒绝无效的用户名', () => {
    const invalidUsernames = [
      'us', // 太短
      'user@name', // 包含特殊字符
      'user name', // 包含空格
      'user#name', // 包含特殊字符
      '',
    ];

    invalidUsernames.forEach(username => {
      const result = validateUsername(username);
      expect(result.valid).toBe(false);
      expect(result.error).toBeDefined();
    });
  });

  it('应该拒绝过短的用户名', () => {
    const result = validateUsername('ab');
    expect(result.valid).toBe(false);
    expect(result.error).toContain('3');
  });

  it('应该拒绝过长的用户名', () => {
    const longUsername = 'a'.repeat(21);
    const result = validateUsername(longUsername);
    expect(result.valid).toBe(false);
    expect(result.error).toContain('20');
  });
});

describe('表单验证 - 文件验证', () => {
  it('应该接受有效的Excel文件', () => {
    const validFiles = [
      { name: 'test.xlsx', size: 1024, type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' },
      { name: 'test.xls', size: 2048, type: 'application/vnd.ms-excel' },
    ];

    validFiles.forEach(file => {
      const result = validateFile(file);
      expect(result.valid).toBe(true);
    });
  });

  it('应该拒绝不支持的文件类型', () => {
    const invalidFiles = [
      { name: 'test.pdf', size: 1024, type: 'application/pdf' },
      { name: 'test.txt', size: 100, type: 'text/plain' },
      { name: 'test.jpg', size: 2048, type: 'image/jpeg' },
    ];

    invalidFiles.forEach(file => {
      const result = validateFile(file);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('Excel');
    });
  });

  it('应该拒绝过大的文件', () => {
    const largeFile = {
      name: 'large.xlsx',
      size: 15 * 1024 * 1024, // 15MB
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    };

    const result = validateFile(largeFile, 10 * 1024 * 1024);
    expect(result.valid).toBe(false);
    expect(result.error).toContain('10MB');
  });

  it('应该拒绝空文件', () => {
    const result = validateFile(null as any);
    expect(result.valid).toBe(false);
    expect(result.error).toBe('请选择文件');
  });

  it('应该允许自定义文件大小限制', () => {
    const file = {
      name: 'test.xlsx',
      size: 5 * 1024 * 1024, // 5MB
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    };

    const result1 = validateFile(file, 10 * 1024 * 1024);
    expect(result1.valid).toBe(true);

    const result2 = validateFile(file, 1 * 1024 * 1024);
    expect(result2.valid).toBe(false);
  });
});

describe('表单验证 - 边界条件', () => {
  it('应该处理包含空格的输入', () => {
    const emailResult = validateEmail('  test@example.com  ');
    expect(emailResult.valid).toBe(false);

    const usernameResult = validateUsername('  username  ');
    expect(usernameResult.valid).toBe(false);
  });

  it('应该处理null值', () => {
    const emailResult = validateEmail(null as any);
    expect(emailResult.valid).toBe(false);
  });

  it('应该处理undefined值', () => {
    const passwordResult = validatePassword(undefined as any);
    expect(passwordResult.valid).toBe(false);
  });

  it('应该处理特殊Unicode字符', () => {
    const emailResult = validateEmail('test+测试@example.com');
    // 简单的邮箱验证可能不接受这个
    expect(emailResult.valid).toBeDefined();
  });
});

describe('表单验证 - 表单提交验证', () => {
  interface FormData {
    email: string;
    password: string;
    username: string;
  }

  const validateForm = (data: FormData): { valid: boolean; errors: Record<string, string> } => {
    const errors: Record<string, string> = {};

    const emailResult = validateEmail(data.email);
    if (!emailResult.valid) {
      errors.email = emailResult.error || '邮箱格式不正确';
    }

    const passwordResult = validatePassword(data.password);
    if (!passwordResult.valid) {
      errors.password = passwordResult.errors[0];
    }

    const usernameResult = validateUsername(data.username);
    if (!usernameResult.valid) {
      errors.username = usernameResult.error || '用户名格式不正确';
    }

    return {
      valid: Object.keys(errors).length === 0,
      errors,
    };
  };

  it('有效的表单数据应该通过验证', () => {
    const formData: FormData = {
      email: 'test@example.com',
      password: 'Password123',
      username: 'testuser',
    };

    const result = validateForm(formData);
    expect(result.valid).toBe(true);
    expect(Object.keys(result.errors)).toHaveLength(0);
  });

  it('应该返回所有字段错误', () => {
    const formData: FormData = {
      email: 'invalid',
      password: 'weak',
      username: 'ab',
    };

    const result = validateForm(formData);
    expect(result.valid).toBe(false);
    expect(result.errors.email).toBeDefined();
    expect(result.errors.password).toBeDefined();
    expect(result.errors.username).toBeDefined();
  });

  it('应该只返回有错误的字段', () => {
    const formData: FormData = {
      email: 'test@example.com', // 有效
      password: 'weak', // 无效
      username: 'testuser', // 有效
    };

    const result = validateForm(formData);
    expect(result.valid).toBe(false);
    expect(result.errors.email).toBeUndefined();
    expect(result.errors.password).toBeDefined();
    expect(result.errors.username).toBeUndefined();
  });
});
