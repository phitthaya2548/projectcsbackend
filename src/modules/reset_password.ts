export interface PasswordResetData {
  email: string;
  otp: string;
  expires_at: FirebaseFirestore.Timestamp | Date;
  used: boolean;
}