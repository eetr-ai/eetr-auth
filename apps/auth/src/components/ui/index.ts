// NOTE: nothing here declares "use client" — every consumer is a `_components/`
// child of a client page, so these land in the client bundle already. A Server
// Component must not import this barrel.
export { cn } from "./cn";
export { Button, buttonVariants, type ButtonProps, type ButtonVariant } from "./button";
export {
	IconButton,
	type IconButtonProps,
	type IconButtonVariant,
} from "./icon-button";
export { Banner, type BannerProps, type BannerVariant } from "./banner";
export {
	Card,
	SectionCard,
	type CardPadding,
	type CardProps,
	type SectionCardProps,
} from "./card";
export { Input, inputClass, type InputProps } from "./input";
export { Select, selectClass, type SelectProps } from "./select";
export { Label, type LabelProps } from "./label";
export { FormField, type FormFieldProps } from "./form-field";
export { Spinner, FullPageSpinner, type SpinnerProps } from "./spinner";
export {
	InlineDeleteConfirm,
	type InlineDeleteConfirmProps,
} from "./delete-confirm";
export { PageHeader, type PageHeaderProps } from "./page-header";
export { EmptyState, type EmptyStateProps } from "./empty-state";
export {
	Table,
	THead,
	TBody,
	Th,
	Td,
	type TableProps,
	type THeadProps,
	type TBodyProps,
	type ThProps,
	type TdProps,
} from "./table";
