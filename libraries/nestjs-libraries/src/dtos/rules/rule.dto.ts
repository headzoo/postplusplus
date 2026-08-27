import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsDefined,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
  Validate,
  ValidateIf,
  ValidateNested,
  ValidationArguments,
  ValidatorConstraint,
  ValidatorConstraintInterface,
} from 'class-validator';
import {
  POST_RULE_ACTIONS,
  POST_RULE_CONDITION_MATCHES,
  POST_RULE_CONDITION_METRICS,
  POST_RULE_CONDITION_OPERATORS,
  POST_RULE_RESCHEDULE_MODES,
} from '@gitroom/nestjs-libraries/dtos/rules/rule.types';
import type {
  PostRuleAction,
  PostRuleConditionMatch,
  PostRuleConditionMetric,
  PostRuleConditionOperator,
  PostRuleRescheduleMode,
} from '@gitroom/nestjs-libraries/dtos/rules/rule.types';
import {
  POST_RULE_MAX_DELAY_HOURS,
  POST_RULE_MAX_EVALUATIONS,
  POST_RULE_MAX_RESCHEDULE_ATTEMPTS,
  isPollingPostRuleAction,
  validatePostRuleDefinition,
} from '@gitroom/nestjs-libraries/database/prisma/rules/post-rules.domain';

@ValidatorConstraint({ name: 'postRuleDefinition', async: false })
class PostRuleDefinitionConstraint implements ValidatorConstraintInterface {
  validate(_value: unknown, args: ValidationArguments) {
    const object = args.object as CreatePostRuleDto | UpdatePostRuleDto;
    return (
      validatePostRuleDefinition({
        action: object.action,
        initialDelayHours: object.initialDelayHours,
        evaluationIntervalHours: object.evaluationIntervalHours,
        maxEvaluations: object.maxEvaluations,
        conditions: object.conditions ?? [],
        actionConfig: object.actionConfig,
        rescheduleConfig: object.rescheduleConfig,
        maxRescheduleAttempts: object.maxRescheduleAttempts,
      }).length === 0
    );
  }

  defaultMessage(args: ValidationArguments) {
    const object = args.object as CreatePostRuleDto | UpdatePostRuleDto;
    const issues = validatePostRuleDefinition({
      action: object.action,
      initialDelayHours: object.initialDelayHours,
      evaluationIntervalHours: object.evaluationIntervalHours,
      maxEvaluations: object.maxEvaluations,
      conditions: object.conditions ?? [],
      actionConfig: object.actionConfig,
      rescheduleConfig: object.rescheduleConfig,
      maxRescheduleAttempts: object.maxRescheduleAttempts,
    });
    return issues
      .map((issue) => `${issue.property}: ${issue.message}`)
      .join('; ');
  }
}

export class PostRuleConditionDto {
  @IsIn([...POST_RULE_CONDITION_METRICS])
  @IsDefined()
  metric!: PostRuleConditionMetric;

  @IsIn([...POST_RULE_CONDITION_OPERATORS])
  @IsDefined()
  operator!: PostRuleConditionOperator;

  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(1_000_000_000)
  threshold!: number;
}

export class PostRuleAutoPlugActionConfigDto {
  @IsString()
  @IsDefined()
  @MinLength(3)
  @MaxLength(20_000)
  content!: string;
}

export class PostRuleManualRescheduleConfigDto {
  @IsIn(['MANUAL'])
  @IsDefined()
  mode!: 'MANUAL';

  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(365)
  daysAfterEvaluation!: number;

  @IsString()
  @IsDefined()
  @Matches(/^([01]\d|2[0-3]):([0-5]\d)$/)
  timeOfDay!: string;

  @IsString()
  @IsDefined()
  @MinLength(1)
  @MaxLength(100)
  timezone!: string;
}

export class PostRulePipelineRescheduleConfigDto {
  @IsIn(['PIPELINE'])
  @IsDefined()
  mode!: 'PIPELINE';

  @IsString()
  @IsDefined()
  @MinLength(1)
  @MaxLength(128)
  pipelineId!: string;
}

export class CreatePostRuleDto {
  @IsString()
  @IsDefined()
  @MinLength(1)
  @MaxLength(120)
  name!: string;

  @IsOptional()
  @IsBoolean()
  enabled?: boolean;

  @IsIn([...POST_RULE_ACTIONS])
  @IsDefined()
  action!: PostRuleAction;

  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(POST_RULE_MAX_DELAY_HOURS)
  initialDelayHours!: number;

  @ValidateIf((value: CreatePostRuleDto) =>
    isPollingPostRuleAction(value.action)
  )
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(POST_RULE_MAX_DELAY_HOURS)
  evaluationIntervalHours?: number;

  @ValidateIf((value: CreatePostRuleDto) =>
    isPollingPostRuleAction(value.action)
  )
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(POST_RULE_MAX_EVALUATIONS)
  maxEvaluations?: number;

  @IsIn([...POST_RULE_CONDITION_MATCHES])
  @IsDefined()
  conditionMatch!: PostRuleConditionMatch;

  @IsArray()
  @ArrayMaxSize(POST_RULE_CONDITION_METRICS.length)
  @ValidateNested({ each: true })
  @Type(() => PostRuleConditionDto)
  conditions!: PostRuleConditionDto[];

  @ValidateIf((value: CreatePostRuleDto) => value.action === 'AUTO_PLUG')
  @ValidateNested()
  @Type(() => PostRuleAutoPlugActionConfigDto)
  actionConfig?: PostRuleAutoPlugActionConfigDto;

  @ValidateIf((value: CreatePostRuleDto) => value.action === 'REMOVE')
  @IsOptional()
  @ValidateNested()
  @Type((options) => {
    const mode = (options?.object as CreatePostRuleDto | undefined)
      ?.rescheduleConfig?.mode;
    if (mode === 'PIPELINE') {
      return PostRulePipelineRescheduleConfigDto;
    }
    return PostRuleManualRescheduleConfigDto;
  })
  rescheduleConfig?:
    | PostRuleManualRescheduleConfigDto
    | PostRulePipelineRescheduleConfigDto;

  @ValidateIf((value: CreatePostRuleDto) => value.rescheduleConfig != null)
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(POST_RULE_MAX_RESCHEDULE_ATTEMPTS)
  maxRescheduleAttempts?: number;

  @Validate(PostRuleDefinitionConstraint)
  private readonly _postRuleDefinition!: true;
}

export class UpdatePostRuleDto extends CreatePostRuleDto {}

export class ReplacePostRuleAssignmentsDto {
  @IsArray()
  @ArrayMaxSize(500)
  @IsString({ each: true })
  @MinLength(1, { each: true })
  integrationIds!: string[];

  @IsArray()
  @ArrayMaxSize(500)
  @IsString({ each: true })
  @MinLength(1, { each: true })
  pipelineIds!: string[];
}

export class PostRuleActivationDto {
  @IsBoolean()
  @IsDefined()
  enabled!: boolean;
}

export {
  POST_RULE_ACTIONS,
  POST_RULE_CONDITION_MATCHES,
  POST_RULE_CONDITION_METRICS,
  POST_RULE_CONDITION_OPERATORS,
  POST_RULE_RESCHEDULE_MODES,
};
export type {
  PostRuleAction,
  PostRuleConditionMatch,
  PostRuleConditionMetric,
  PostRuleConditionOperator,
  PostRuleRescheduleMode,
} from '@gitroom/nestjs-libraries/dtos/rules/rule.types';
