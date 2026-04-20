const { MercadoPagoConfig, Payment } = require('mercadopago');

const client = new MercadoPagoConfig({
  accessToken: process.env.ACCESS_TOKEN,
});

const payment = new Payment(client);

async function criarCobrancaPix({ valor, descricao, emailComprador }) {
  try {
    const resultado = await payment.create({
      body: {
        transaction_amount: valor,
        description: descricao,
        payment_method_id: 'pix',
        payer: {
          email: emailComprador,
        },
      },
      requestOptions: {
        idempotencyKey: `pix-${Date.now()}`,
      },
    });

    return {
      id: resultado.id,
      status: resultado.status,
      qrCode: resultado.point_of_interaction.transaction_data.qr_code,
      qrCodeBase64: resultado.point_of_interaction.transaction_data.qr_code_base64,
      valor: resultado.transaction_amount,
    };

  } catch (erro) {
    console.error('Erro ao criar cobrança:', erro);
    throw new Error('Não foi possível criar a cobrança Pix');
  }
}

async function consultarPagamento(paymentId) {
  try {
    const resultado = await payment.get({ id: paymentId });
    return {
      id: resultado.id,
      status: resultado.status,
      valor: resultado.transaction_amount,
    };
  } catch (erro) {
    console.error('Erro ao consultar pagamento:', erro);
    throw new Error('Não foi possível consultar o pagamento');
  }
}

module.exports = { criarCobrancaPix, consultarPagamento };