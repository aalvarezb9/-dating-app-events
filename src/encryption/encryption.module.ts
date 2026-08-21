import { Module, Global } from '@nestjs/common';
import { EncryptionService } from './encryption.service';
import { SharedConfigModule } from '../config/shared-config.module';

@Global()
@Module({
  imports: [SharedConfigModule],
  providers: [EncryptionService],
  exports: [EncryptionService],
})
export class EncryptionModule {}
