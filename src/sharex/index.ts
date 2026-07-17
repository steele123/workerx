import { Hono } from 'hono';
import { utilityRouter } from '../utility';
import { fileRouter } from './file';
import { imgRouter } from './img';
import { linkRouter } from './link';

export const shareRouter = new Hono<{ Bindings: Env }>();

shareRouter.route('/', utilityRouter);
shareRouter.route('/img', imgRouter);
shareRouter.route('/file', fileRouter);
shareRouter.route('/', linkRouter);
