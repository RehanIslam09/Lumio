import React from "react";
import type { ApiClient } from "../../api/client.js";
import { AuthCard } from "./AuthCard.js";

export interface RegisterPageProps {
  client?: ApiClient;
  onSuccess?: () => void;
  initialEmail?: string;
}

export const RegisterPage: React.FC<RegisterPageProps> = ({
  client,
  onSuccess,
  initialEmail,
}) => {
  return (
    <AuthCard
      mode="register"
      client={client}
      onSuccess={onSuccess}
      initialEmail={initialEmail}
    />
  );
};
