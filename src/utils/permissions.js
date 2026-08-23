const privilegedRoles = new Set(['admin', 'directeur']);

export const canViewFeature = (user, featureKey) => {
  if (privilegedRoles.has(user?.role)) return true;
  return Boolean(user?.permissions?.[featureKey]?.view);
};

export const canManageFeature = (user, featureKey) => {
  if (user?.is_demo) return false;
  if (privilegedRoles.has(user?.role)) return true;
  return Boolean(user?.permissions?.[featureKey]?.view && user?.permissions?.[featureKey]?.manage);
};
