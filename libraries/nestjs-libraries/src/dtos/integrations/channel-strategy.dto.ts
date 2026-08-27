import { IsIn, IsString } from 'class-validator';
import {
  CHANNEL_STRATEGY_IDS,
  ChannelStrategyId,
} from '@gitroom/nestjs-libraries/channel-strategies/channel-strategy.types';

export class UpdateChannelStrategyDto {
  @IsString()
  @IsIn(CHANNEL_STRATEGY_IDS)
  strategyId!: ChannelStrategyId;
}
