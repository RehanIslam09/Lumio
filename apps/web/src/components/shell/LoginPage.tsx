import React from "react";
import type { ApiClient } from "../../api/client.js";
import { AuthCard } from "./AuthCard.js";

export interface LoginPageProps {
  client?: ApiClient;
  onSuccess?: () => void;
  initialEmail?: string;
}

export const LoginPage: React.FC<LoginPageProps> = ({
  client,
  onSuccess,
  initialEmail,
}) => {
  return (
    <AuthCard
      mode="login"
      client={client}
      onSuccess={onSuccess}
      initialEmail={initialEmail}
    />
  );
};
